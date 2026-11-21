import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config';

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use(
  cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
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

app.get('/', (req, res) => {
  res.send('SalonBook server is running!');
});

// Users related Api 
app.get('/users', async (req, res) => {
  const result = await users.find({}).toArray();
  res.send(result);
});

//Get single user profile (Customer and Admin)

// GET single user profile (Customer & Admin)
app.get('/users/profile', async (req, res) => {
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
app.patch('/users/profile', async (req, res) => {
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
app.patch('/users/:id/status', async (req, res) => {
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


// Service related Api 
app.post('/services', async (req, res) => {
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

app.patch('/services/:id', async (req, res) => {
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

app.delete('/services/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid service ID' });
  }
  const result = await services.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});


// Create appointment request (Customer only, Active service only, No duplicate slot)
// app.post('/appointments', async (req, res) => {
//   try {
//     const {
//       serviceId,
//       customerId,
//       customerName,
//       customerEmail,
//       serviceName,
//       serviceImage,
//       serviceCategory,
//       servicePrice,
//       appointmentDate,
//       timeSlot,
//       message,
//       role,
//     } = req.body;

//     if (role === 'admin') {
//       return res.status(403).send({ message: 'Admins cannot book customer appointments.' });
//     }

//     if (!ObjectId.isValid(serviceId)) {
//       return res.status(400).send({ message: 'Invalid service ID.' });
//     }

//     // 1. Ensure service exists and is Active
//     const service = await services.findOne({ _id: new ObjectId(serviceId) });
//     if (!service || service.status === 'Inactive' || service.isActive === false) {
//       return res.status(400).send({ message: 'This service is currently unavailable for booking.' });
//     }

//     // 2. Prevent duplicate active appointment for same service, date & time slot
//     const existingSlot = await appointments.findOne({
//       serviceId,
//       appointmentDate,
//       timeSlot,
//       status: { $in: ['Pending', 'Confirmed'] },
//     });

//     if (existingSlot) {
//       return res
//         .status(409)
//         .send({ message: 'This time slot is already booked. Please choose another time.' });
//     }

//     const newAppointment = {
//       serviceId,
//       serviceName,
//       serviceImage,
//       serviceCategory,
//       servicePrice: Number(servicePrice),
//       customerId,
//       customerName,
//       customerEmail,
//       appointmentDate,
//       timeSlot,
//       message: message || '',
//       status: 'Pending',
//       paymentStatus: 'Unpaid',
//       createdAt: new Date().toISOString(),
//     };

//     const result = await appointments.insertOne(newAppointment);
//     res.status(201).send(result);
//   } catch (error) {
//     res.status(500).send({ message: 'Failed to submit appointment request.' });
//   }
// });
app.post('/appointments', async (req, res) => {
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
app.get('/appointments', async (req, res) => {
  const query = {};
  if (req.query.email) query.customerEmail = req.query.email;
  if (req.query.customerId) query.customerId = req.query.customerId;

  const result = await appointments.find(query).sort({ createdAt: -1 }).toArray();
  res.send(result);
});



// Update appointment status rull based (Server-enforced transitions)
app.patch('/appointments/:id', async (req, res) => {
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

app.listen(port, () => {
  console.log(`SalonBook server is running on port ${port}`);
});