// import express from 'express';
// import cors from 'cors';
// import { MongoClient, ObjectId  } from 'mongodb';
// import 'dotenv/config'

// const app = express();
// const port = process.env.PORT || 5000;


// //Middleware
// app.use(express.json());
// app.use(cors());



// // import { MongoClient } from 'mongodb';

// const client = new MongoClient(`mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0-shard-00-00.nsvzy.mongodb.net:27017,cluster0-shard-00-01.nsvzy.mongodb.net:27017,cluster0-shard-00-02.nsvzy.mongodb.net:27017/?ssl=true&replicaSet=atlas-6jrxdo-shard-0&authSource=admin`);

// export async function connectToMongoDB() {
//   try {
//     await client.connect();
//     console.log("You successfully connected to MongoDB!");
//     return client;
//   } catch (err) {
//     console.dir(err);
//   }
// }

// const connectedClient = await connectToMongoDB();
// const database = connectedClient.db('salonbook');
// const users = database.collection('user');
// const services = database.collection('services');



// app.get('/', (req, res)=> {
// res.send ('SalonBook server is running!');
// });

// //Users collection 
// app.get('/users', async (req, res)=>{
//   const cursor = users.find({});
//   const result = await cursor.toArray();
//   res.send(result);
// });

// //services related API post service to mongoDb

// app.post('/services', async(req, res)=>{
//   const service = req.body;
//   const result = await services.insertOne(service);
//   res.send(result)
// })

// //Get update and delete services related api 


// // GET all services (or filter ?status=Active on public Browse Services page)
// app.get("/services", async (req, res) => {
//   const query = {};
//   if (req.query.status === "Active") {
//     query.$or = [{ status: "Active" }, { status: { $exists: false } }];
//   }
//   const result = await services.find(query).toArray();
//   res.send(result);
// });


// // PATCH update service details or Active/Inactive status
// app.patch("/services/:id", async (req, res) => {
//   const id = req.params.id;
//   const updatedData = req.body;
//   const result = await services.updateOne(
//     { _id: new ObjectId(id) },
//     { $set: updatedData }
//   );
//   res.send(result);
// });

// // GET single service by ID (for Service Details page)
// app.get("/services/:id", async (req, res) => {
//   const id = req.params.id;
//   const result = await services.findOne({ _id: new ObjectId(id) });
//   res.send(result);
// });

// // DELETE a service
// app.delete("/services/:id", async (req, res) => {
//   const id = req.params.id;
//   const result = await services.deleteOne({ _id: new ObjectId(id) });
//   res.send(result);
// });


// //Listen last part 

// app.listen(port, () => {
//     console.log(`SalonBook server is running on port ${port}`);
// });

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

// ================= USERS =================
app.get('/users', async (req, res) => {
  const result = await users.find({}).toArray();
  res.send(result);
});

// ================= SERVICES =================
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

// ================= APPOINTMENTS =================
// Create appointment request (Customer only, Active service only, No duplicate slot)
app.post('/appointments', async (req, res) => {
  try {
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
      return res.status(403).send({ message: 'Admins cannot book customer appointments.' });
    }

    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).send({ message: 'Invalid service ID.' });
    }

    // 1. Ensure service exists and is Active
    const service = await services.findOne({ _id: new ObjectId(serviceId) });
    if (!service || service.status === 'Inactive' || service.isActive === false) {
      return res.status(400).send({ message: 'This service is currently unavailable for booking.' });
    }

    // 2. Prevent duplicate active appointment for same service, date & time slot
    const existingSlot = await appointments.findOne({
      serviceId,
      appointmentDate,
      timeSlot,
      status: { $in: ['Pending', 'Confirmed'] },
    });

    if (existingSlot) {
      return res
        .status(409)
        .send({ message: 'This time slot is already booked. Please choose another time.' });
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
  } catch (error) {
    res.status(500).send({ message: 'Failed to submit appointment request.' });
  }
});

// Get appointments (filter by ?email= or ?customerId= for Customer, all for Admin)
app.get('/appointments', async (req, res) => {
  const query = {};
  if (req.query.email) query.customerEmail = req.query.email;
  if (req.query.customerId) query.customerId = req.query.customerId;

  const result = await appointments.find(query).sort({ createdAt: -1 }).toArray();
  res.send(result);
});

// Update appointment status (Customer cancels Pending; Admin Confirms or Cancels)
app.patch('/appointments/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) {
    return res.status(400).send({ message: 'Invalid appointment ID' });
  }
  const result = await appointments.updateOne(
    { _id: new ObjectId(id) },
    { $set: req.body }
  );
  res.send(result);
});

app.listen(port, () => {
  console.log(`SalonBook server is running on port ${port}`);
});