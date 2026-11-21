import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import 'dotenv/config';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(
  cors({
    origin: [process.env.CLIENT_URL || 'http://localhost:3000'],
    credentials: true,
  })
);

const client = new MongoClient(
  `mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0-shard-00-00.nsvzy.mongodb.net:27017,cluster0-shard-00-01.nsvzy.mongodb.net:27017,cluster0-shard-00-02.nsvzy.mongodb.net:27017/?ssl=true&replicaSet=atlas-6jrxdo-shard-0&authSource=admin`
);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('salonbook');
const users = database.collection('user');
const services = database.collection('services');
const appointments = database.collection('appointments');
const transactions = database.collection('transactions');

// JWT Verification Middlewares (Better Auth JWKS via jose)
const JWKS = createRemoteJWKSet(
  new URL(`${process.env.CLIENT_URL || 'http://localhost:3000'}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log(' No JWT Token found in request:', req.originalUrl);
    return res.status(401).send({ message: 'Unauthorized access.' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access.' });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.decoded = payload;
    console.log('✅ JWT Verified for:', payload.email, '| Route:', req.originalUrl);
    next();
  } catch (err) {
    console.log(' Invalid JWT Token:', err.message);
    return res.status(401).send({ message: 'Invalid or expired token.' });
  }
};

const verifyAdmin = async (req, res, next) => {
  const dbUser = await users.findOne({ email: req.decoded?.email });
  if (dbUser?.role !== 'admin') {
    return res.status(403).send({ message: 'Forbidden: Admin access only.' });
  }
  next();
};

app.get('/', (req, res) => {
  res.send('SalonBook server is running!');
});

// Users related API
app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
  const result = await users.find({}).toArray();
  res.send(result);
});

// GET single user profile (Customer & Admin)
app.get('/users/profile', verifyToken, async (req, res) => {
  const { email } = req.query;
  if (!email) {
    return res.status(400).send({ message: 'Email is required.' });
  }

  const user = await users.findOne({ email });
  if (!user) {
    return res.status(404).send({ message: 'User not found.' });
  }

  res.send({
    _id: user._id,
    name: user.name || '',
    email: user.email,
    image: user.image || '',
    phone: user.phone || '',
    role: user.role || 'customer',
    isBlocked: Boolean(user.isBlocked),
    createdAt: user.createdAt || null,
  });
});

// PATCH update permitted profile fields (Name, Image, Phone only)
app.patch('/users/profile', verifyToken, async (req, res) => {
  const { email, requesterEmail, name, image, phone } = req.body;

  if (!email || !requesterEmail || email !== requesterEmail) {
    return res
      .status(403)
      .send({ message: 'Unauthorized: You can only update your own profile.' });
  }

  if (!name || !name.trim()) {
    return res.status(400).send({ message: 'Full name cannot be empty.' });
  }

  const safeUpdates = {
    name: name.trim(),
    image: typeof image === 'string' ? image.trim() : '',
    phone: typeof phone === 'string' ? phone.trim() : '',
    updatedAt: new Date().toISOString(),
  };

  const result = await users.updateOne({ email }, { $set: safeUpdates });

  if (result.matchedCount === 0) {
    return res.status(404).send({ message: 'User profile not found.' });
  }

  res.send({ message: 'Profile updated successfully.', ...safeUpdates });
});

// PATCH block or unblock a customer account (Admin only)
app.patch('/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  const { isBlocked } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid user ID.' });
  }

  const targetUser = await users.findOne({ _id: new ObjectId(id) });
  if (!targetUser) {
    return res.status(404).send({ message: 'User not found.' });
  }

  if (targetUser.role === 'admin') {
    return res
      .status(403)
      .send({ message: 'Administrator accounts cannot be blocked.' });
  }

  const result = await users.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        isBlocked: Boolean(isBlocked),
        updatedAt: new Date().toISOString(),
      },
    }
  );

  res.send({
    message: Boolean(isBlocked)
      ? 'Customer account blocked.'
      : 'Customer account unblocked.',
    modifiedCount: result.modifiedCount,
  });
});

// Service related API
app.post('/services', verifyToken, verifyAdmin, async (req, res) => {
  const service = req.body;
  const result = await services.insertOne(service);
  res.send(result);
});

app.get('/services', async (req, res) => {
  const query = {};
  if (req.query.status === 'Active') {
    query.$or = [{ status: 'Active' }, { status: { $exists: false } }];
  }
  const result = await services.find(query).toArray();
  res.send(result);
});

// Featured active services for the home page (default 6, newest first)
app.get('/services/featured', async (req, res) => {
  const limit = Number(req.query.limit) > 0 ? Number(req.query.limit) : 6;
  const result = await services
    .find({ $or: [{ status: 'Active' }, { status: { $exists: false } }] })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  res.send(result);
});

// Distinct categories of active services for the home page
app.get('/services/categories', async (req, res) => {
  const result = await services.distinct('category', {
    $or: [{ status: 'Active' }, { status: { $exists: false } }],
  });
  res.send(result);
});

app.get('/services/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid service ID' });
  }
  const result = await services.findOne({ _id: new ObjectId(id) });
  if (!result) {
    return res.status(404).send({ message: 'Service not found' });
  }
  res.send(result);
});

app.patch('/services/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid service ID' });
  }
  const result = await services.updateOne(
    { _id: new ObjectId(id) },
    { $set: req.body }
  );
  res.send(result);
});

app.delete('/services/:id', verifyToken, verifyAdmin, async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid service ID' });
  }
  const result = await services.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// Create appointment request (Customer only, Active service only, No duplicate slot)
app.post('/appointments', verifyToken, async (req, res) => {
  const {
    serviceId,
    customerId,
    customerName,
    customerEmail,
    serviceName,
    serviceImage,
    serviceCategory,
    servicePrice,
    appointmentDate,
    timeSlot,
    message,
    role,
  } = req.body;

  if (role === 'admin') {
    return res
      .status(403)
      .send({ message: 'Admins cannot book customer appointments.' });
  }

  const customerRecord = await users.findOne({ email: customerEmail });
  if (customerRecord?.isBlocked) {
    return res.status(403).send({
      message: 'Your account is currently blocked. Please contact the salon.',
    });
  }

  if (!ObjectId.isValid(serviceId)) {
    return res.status(400).send({ message: 'Invalid service ID.' });
  }

  // 1. Ensure service exists and is Active
  const service = await services.findOne({ _id: new ObjectId(serviceId) });
  if (!service || service.status === 'Inactive' || service.isActive === false) {
    return res
      .status(400)
      .send({ message: 'This service is currently unavailable for booking.' });
  }

  // 2. Prevent duplicate active appointment for same service, date & time slot
  const existingSlot = await appointments.findOne({
    serviceId,
    appointmentDate,
    timeSlot,
    status: { $in: ['Pending', 'Confirmed'] },
  });

  if (existingSlot) {
    return res.status(409).send({
      message: 'This time slot is already booked. Please choose another time.',
    });
  }

  const newAppointment = {
    serviceId,
    serviceName,
    serviceImage,
    serviceCategory,
    servicePrice: Number(servicePrice),
    customerId,
    customerName,
    customerEmail,
    appointmentDate,
    timeSlot,
    message: message || '',
    status: 'Pending',
    paymentStatus: 'Unpaid',
    createdAt: new Date().toISOString(),
  };

  const result = await appointments.insertOne(newAppointment);
  res.status(201).send(result);
});

// Get appointments (filter by ?email= or ?customerId= for Customer, all for Admin)
app.get('/appointments', verifyToken, async (req, res) => {
// app.get('/appointments',  async (req, res) => {
  const query = {};
  if (req.query.email) query.customerEmail = req.query.email;
  if (req.query.customerId) query.customerId = req.query.customerId;

  const result = await appointments.find(query).sort({ createdAt: -1 }).toArray();
  res.send(result);
});

// Update appointment status rule based (Server-enforced transitions)
app.patch('/appointments/:id', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid appointment ID.' });
  }

  const existing = await appointments.findOne({ _id: new ObjectId(id) });
  if (!existing) {
    return res.status(404).send({ message: 'Appointment not found.' });
  }

  // Rule: Only Pending appointments can be Confirmed
  if (status === 'Confirmed' && existing.status !== 'Pending') {
    return res
      .status(400)
      .send({ message: 'Only pending appointments can be confirmed.' });
  }

  // Rule: Only Pending or Confirmed appointments can be Cancelled
  if (
    status === 'Cancelled' &&
    !['Pending', 'Confirmed'].includes(existing.status)
  ) {
    return res
      .status(400)
      .send({ message: 'This appointment is already cancelled.' });
  }

  const result = await appointments.updateOne(
    { _id: new ObjectId(id) },
    { $set: { ...req.body, updatedAt: new Date().toISOString() } }
  );
  res.send(result);
});

// 1. Create Stripe Checkout Session (Confirmed & Unpaid appointments only)
app.post('/create-checkout-session', verifyToken, async (req, res) => {
  const { appointmentId, customerEmail } = req.body;

  if (!ObjectId.isValid(appointmentId)) {
    return res.status(400).send({ message: 'Invalid appointment ID.' });
  }

  const appointment = await appointments.findOne({
    _id: new ObjectId(appointmentId),
  });

  if (!appointment) {
    return res.status(404).send({ message: 'Appointment not found.' });
  }

  if (appointment.status !== 'Confirmed') {
    return res
      .status(400)
      .send({ message: 'Only confirmed appointments can be paid.' });
  }

  if (appointment.paymentStatus === 'Paid') {
    return res
      .status(400)
      .send({ message: 'This appointment is already paid.' });
  }

  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customerEmail || appointment.customerEmail,
    line_items: [
      {
        price_data: {
          currency: 'gbp',
          product_data: {
            name: appointment.serviceName,
            description: `Appointment on ${appointment.appointmentDate} at ${appointment.timeSlot}`,
          },
          unit_amount: Math.round(Number(appointment.servicePrice) * 100),
        },
        quantity: 1,
      },
    ],
    metadata: {
      appointmentId: appointment._id.toString(),
      customerId: appointment.customerId || '',
      customerName: appointment.customerName || '',
      customerEmail: appointment.customerEmail || '',
      serviceName: appointment.serviceName || '',
    },
    success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${clientUrl}/payment/cancel?appointment_id=${appointment._id.toString()}`,
  });

  res.send({ url: session.url, sessionId: session.id });
});

// 2. Verify Stripe Session, Mark Appointment Paid & Save Transaction
app.get('/payments/verify/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const session = await stripe.checkout.sessions.retrieve(sessionId);

  const isPaid = session.payment_status === 'paid';
  const {
    appointmentId,
    customerId,
    customerName,
    customerEmail,
    serviceName,
  } = session.metadata || {};

  if (isPaid && appointmentId && ObjectId.isValid(appointmentId)) {
    await appointments.updateOne(
      { _id: new ObjectId(appointmentId) },
      {
        $set: {
          paymentStatus: 'Paid',
          stripeSessionId: session.id,
          updatedAt: new Date().toISOString(),
        },
      }
    );

    const existingTx = await transactions.findOne({
      stripeSessionId: session.id,
    });

    if (!existingTx) {
      await transactions.insertOne({
        appointmentId,
        customerId: customerId || '',
        customerName: customerName || '',
        customerEmail: customerEmail || session.customer_email || '',
        serviceName: serviceName || 'Salon Service',
        amount: (session.amount_total || 0) / 100,
        currency: (session.currency || 'gbp').toUpperCase(),
        stripeSessionId: session.id,
        status: 'paid',
        createdAt: new Date().toISOString(),
      });
    }
  }

  const appointment =
    appointmentId && ObjectId.isValid(appointmentId)
      ? await appointments.findOne({ _id: new ObjectId(appointmentId) })
      : null;

  res.send({
    verified: isPaid,
    stripeSessionId: session.id,
    amount: (session.amount_total || 0) / 100,
    currency: (session.currency || 'gbp').toUpperCase(),
    appointment,
  });
});

// 3. Get All Transactions (Read-only for Admin Transactions Page)
app.get('/transactions', verifyToken, verifyAdmin, async (req, res) => {
  const result = await transactions.find().sort({ createdAt: -1 }).toArray();
  res.send(result);
});

app.listen(port, () => {
  console.log(`SalonBook server is running on port ${port}`);
});