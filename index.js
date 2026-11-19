import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId  } from 'mongodb';
import 'dotenv/config'

const app = express();
const port = process.env.PORT || 5000;


//Middleware
app.use(express.json());
app.use(cors());



// import { MongoClient } from 'mongodb';

const client = new MongoClient(`mongodb://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0-shard-00-00.nsvzy.mongodb.net:27017,cluster0-shard-00-01.nsvzy.mongodb.net:27017,cluster0-shard-00-02.nsvzy.mongodb.net:27017/?ssl=true&replicaSet=atlas-6jrxdo-shard-0&authSource=admin`);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db('salonbook');
const users = database.collection('user');
const services = database.collection('services');



app.get('/', (req, res)=> {
res.send ('SalonBook server is running!');
});

//Users collection 
app.get('/users', async (req, res)=>{
  const cursor = users.find({});
  const result = await cursor.toArray();
  res.send(result);
});

//services related API post service to mongoDb

app.post('/services', async(req, res)=>{
  const service = req.body;
  const result = await services.insertOne(service);
  res.send(result)
})

//Get update and delete services related api 


// GET all services (or filter ?status=Active on public Browse Services page)
app.get("/services", async (req, res) => {
  const query = {};
  if (req.query.status === "Active") {
    query.$or = [{ status: "Active" }, { status: { $exists: false } }];
  }
  const result = await services.find(query).toArray();
  res.send(result);
});

// DELETE a service
app.delete("/services/:id", async (req, res) => {
  const id = req.params.id;
  const result = await services.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});







//Listen last part 

app.listen(port, () => {
    console.log(`SalonBook server is running on port ${port}`);
});
