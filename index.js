const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.5rne0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    const db = client.db('employee_management');
    const usersCollection = db.collection('users');
    const paymentsCollection = db.collection('payments');
    const tasksCollection = db.collection('tasks');
    const messagesCollection = db.collection('messages');
    // users related apis
    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user doesnt exists:
      // you can do this many ways (1.email unique, 2.upsert 3. simple checking)
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.post('/work-sheet', async (req, res) => {
      const tasks = req.body;
      const result = await tasksCollection.insertOne(tasks);
      res.send(result);
    });
    app.get('/work-sheets', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await tasksCollection.find(query).toArray();
      res.send(result);
    });
    app.delete('/work-sheet/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await tasksCollection.deleteOne(query);
      res.send(result);
      console.log(result);
    });

    // get payment history
    app.get('/payment-history', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await tasksCollection.find(query).toArray();
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('site is running');
});
app.listen(port, () => console.log(`Server running on port ${port}`));
