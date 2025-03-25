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
    const payrollCollection = db.collection('payroll');

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

    // 1. API route to get all payroll records (pending payments)
    app.get('/payroll', verifyToken, verifyAdmin, async (req, res) => {
      try {
        // Fetch payroll data that hasn't been paid yet
        const payrolls = await payrollCollection
          .find({ status: 'Pending' })
          .toArray();

        if (payrolls.length > 0) {
          res.status(200).json(payrolls);
        } else {
          res.status(404).send({ message: 'No pending payrolls found' });
        }
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch payrolls', error });
      }
    });

    // 2. API route to update payroll status to "Paid" and add payment date
    app.patch('/payroll/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const paymentDate = new Date(); // Set current date as payment date

        // Update the payroll status to 'Paid' and add payment date
        const updateDoc = {
          $set: {
            status: 'Paid',
            paymentDate: paymentDate, // Set payment date to current date
          },
        };

        const filter = { _id: new ObjectId(id) };

        // Update the payroll entry in the database
        const result = await payrollCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res.send({ message: 'Payment processed successfully' });
        } else {
          res
            .status(404)
            .send({ message: 'Payroll not found or already paid' });
        }
      } catch (error) {
        res.status(500).send({ message: 'Failed to process payment', error });
      }
    });
    // Employee related apis

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

    // app.patch('/work-sheet/:id', async (req, res) => {
    //   const id = req.params.id;
    //   const updatedTask = req.body;
    //   const filter = { _id: new ObjectId(id) };
    //   const updateDoc = { $set: updatedTask };
    //   const result = await tasksCollection.updateOne(filter, updateDoc);
    //   res.send(result);
    // });

    app.put('/work-sheet/:id', async (req, res) => {
      const id = req.params.id;
      const updatedData = req.body;

      // Ensure `_id` is not included in the update operation
      delete updatedData._id;

      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: updatedData, // Only update provided fields
      };

      try {
        const result = await tasksCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).send({ message: 'Update failed', error });
      }
    });
    // Get Employee Details by Slug (email or uid)
    app.get('/employee-details/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const employee = await usersCollection.findOne(query);

        if (!employee) {
          return res.status(404).json({ message: 'Employee not found' });
        }

        res.json(employee); // ✅ Correctly send the response once
      } catch (error) {
        res.status(500).json({ message: 'Server error', error });
      }
    });

    // Get Employee Salary History
    app.get('/employee-salary/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const salaryHistory = await payrollCollection
          .find({ employeeEmail: id })
          .sort({ year: 1, month: 1 }) // Sort by Year & Month
          .select('month year amount -_id'); // Return only required fields

        if (!salaryHistory.length) {
          return res.status(404).json({ message: 'No salary history found' });
        }

        res.json(salaryHistory);
      } catch (error) {
        res.status(500).json({ message: 'Server error', error });
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
    app.get('/employee-list', verifyToken, async (req, res) => {
      try {
        const employees = await usersCollection
          .find({}, { projection: { password: 0 } }) // Exclude sensitive fields
          .toArray();
        res.send(employees);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch employees', error });
      }
    });

    app.patch('/hr/verify-employee/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Validate ID
        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: 'Invalid employee ID' });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { isVerified: true },
        };

        const result = await usersCollection.updateOne(filter, updateDoc);

        if (result.modifiedCount > 0) {
          res.send({ message: 'Employee verified successfully', result });
        } else {
          res
            .status(404)
            .send({ message: 'Employee not found or already verified' });
        }
      } catch (error) {
        res.status(500).send({ message: 'Failed to verify employee', error });
      }
    });

    // Endpoint to handle payment requests
    app.post('/payroll', async (req, res) => {
      try {
        const { employeeId, name, email, salary, month, year } = req.body;

        const newPayment = {
          employeeId,
          name,
          email,
          salary,
          month,
          year,
          status: 'Pending', // Default status before admin approval
          createdAt: new Date(),
        };

        const result = await payrollCollection.insertOne(newPayment);
        res.status(201).json({ insertedId: result.insertedId });
      } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to process payment' });
      }
    });

    // ✅ GET all work records (Filter by name & month)
    app.get('/progress', verifyToken, async (req, res) => {
      try {
        const { name, month } = req.query;

        let query = {};
        if (name) {
          query.name = { $regex: new RegExp(`^${name}$`, 'i') }; // Case-insensitive search
        }
        if (month) {
          query.date = {
            $gte: new Date(`${month}-01T00:00:00.000Z`),
            $lt: new Date(`${month}-31T23:59:59.999Z`),
          };
        }

        const records = await tasksCollection.find(query).toArray();
        res.json(records);
      } catch (error) {
        console.error('Error fetching progress data:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // ✅ POST a new work record
    // app.post('/progress', verifyToken, async (req, res) => {
    //   try {
    //     const { name, email, task, date } = req.body;
    //     if (!name || !email || !task || !date) {
    //       return res.status(400).json({ error: 'All fields are required' });
    //     }

    //     const newRecord = { name, email, task, date: new Date(date) };
    //     const result = await workRecordsCollection.insertOne(newRecord);
    //     res
    //       .status(201)
    //       .json({ message: 'Work record added successfully', newRecord });
    //   } catch (error) {
    //     console.error('Error adding work record:', error);
    //     res.status(500).json({ error: 'Internal Server Error' });
    //   }
    // });

    // ✅ UPDATE a work record
    app.put('/progress/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const { task } = req.body;

        const result = await tasksCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { task } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Work record not found' });
        }

        res.json({ message: 'Work record updated' });
      } catch (error) {
        console.error('Error updating work record:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    });

    // ✅ DELETE a work record
    app.delete('/progress/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;

        const result = await tasksCollection.deleteOne({
          _id: new ObjectId(id),
        });

        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Work record not found' });
        }

        res.json({ message: 'Work record deleted' });
      } catch (error) {
        console.error('Error deleting work record:', error);
        res.status(500).json({ error: 'Internal Server Error' });
      }
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
