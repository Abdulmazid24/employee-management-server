const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
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

    // jwt related apis
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h',
      });
      res.send({ token });
    });
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

    // verify token middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (error, decoded) => {
        if (error) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };
    // use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };
    app.get('/user/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });
    // Admin only apis
    app.get(
      '/all-employee-list',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        console.log(req.headers);
        const result = await usersCollection.find().toArray();
        res.send(result);
      }
    );
    app.patch(
      '/employee/hr/:id',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: 'HR',
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    app.get('/payroll', verifyToken, verifyAdmin, async (req, res) => {
      console.log(req.headers);
      const result = await paymentsCollection.find().toArray();
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

    // Get payment history for logged-in employee
    app.get('/payment-history', verifyToken, async (req, res) => {
      try {
        const email = req.decoded.email; // JWT থেকে ইমেইল নেওয়া
        const query = { email: email };
        const result = await paymentsCollection
          .find(query)
          .sort({ year: 1, month: 1 })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch payment history' });
      }
    });

    // HR Routes
    // ✅ 1. Get All Employees (HR Only)
    // Dummy database (Array)
    let workRecords = [
      {
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
        task: 'Completed report',
        date: '2024-03-01',
      },
      {
        id: 2,
        name: 'Jane Smith',
        email: 'jane@example.com',
        task: 'Fixed bugs',
        date: '2024-03-10',
      },
      {
        id: 3,
        name: 'Michael Johnson',
        email: 'michael@example.com',
        task: 'Updated database',
        date: '2024-02-15',
      },
    ];
    app.get('/employee-list', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const employees = await usersCollection.find().toArray();
        res.send(employees);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch employees', error });
      }
    });

    app.get('/hr/employee-details/:email', verifyToken, async (req, res) => {
      try {
        const email = req.params.email;

        // Find employee details
        const employee = await usersCollection.findOne({ email });

        if (!employee) {
          return res.status(404).send({ message: 'Employee not found' });
        }

        // Fetch employee's salary history from payments collection
        const payments = await paymentsCollection.find({ email }).toArray();

        res.send({ employee, payments });
      } catch (error) {
        console.error('Error fetching employee details:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Progress Page - Work Records API

    // ✅ GET all work records (Filter by name & month)
    app.get('/progress', verifyToken, (req, res) => {
      const { name, month } = req.query;
      let filteredRecords = workRecords;

      if (name) {
        filteredRecords = filteredRecords.filter(
          record => record.name.toLowerCase() === name.toLowerCase()
        );
      }

      if (month) {
        filteredRecords = filteredRecords.filter(record =>
          record.date.startsWith(month)
        );
      }

      res.json(filteredRecords);
    });

    // ✅ POST a new work record
    app.post('/progress', verifyToken, (req, res) => {
      const { name, email, task, date } = req.body;
      if (!name || !email || !task || !date) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      const newRecord = { id: workRecords.length + 1, name, email, task, date };
      workRecords.push(newRecord);
      res
        .status(201)
        .json({ message: 'Work record added successfully', newRecord });
    });

    // ✅ UPDATE a work record
    app.put('/progress/:id', verifyToken, (req, res) => {
      const { id } = req.params;
      const { task } = req.body;

      const record = workRecords.find(record => record.id === parseInt(id));
      if (!record)
        return res.status(404).json({ error: 'Work record not found' });

      record.task = task;
      res.json({ message: 'Work record updated', record });
    });

    // ✅ DELETE a work record
    app.delete('/progress/:id', verifyToken, (req, res) => {
      const { id } = req.params;
      workRecords = workRecords.filter(record => record.id !== parseInt(id));

      res.json({ message: 'Work record deleted' });
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
