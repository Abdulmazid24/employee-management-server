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
    const payrollCollection = db.collection('payroll');

    // jwt related apis
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h',
      });
      res.send({ token });
    });
    // // users related apis
    // app.post('/users', async (req, res) => {
    //   try {
    //     const user = req.body;

    //     // Validate required fields (remove password)
    //     const requiredFields = [
    //       'name',
    //       'email',
    //       'role',
    //       'bankAccountNo',
    //       'designation',
    //       'salary',
    //       'image',
    //     ];
    //     const missingFields = requiredFields.filter(field => !user[field]);

    //     if (missingFields.length > 0) {
    //       return res.status(400).json({
    //         success: false,
    //         message: `Missing required fields: ${missingFields.join(', ')}`,
    //         missingFields,
    //       });
    //     }

    //     // Validate image URL format if provided
    //     if (user.image && !isValidUrl(user.image)) {
    //       return res.status(400).json({
    //         success: false,
    //         message: 'Invalid image URL format',
    //       });
    //     }

    //     // Rest of your existing validation...

    //     // Create user document (remove password)
    //     const userDoc = {
    //       name: user.name,
    //       email: user.email,
    //       image: user.image,
    //       role: user.role,
    //       bankAccountNo: user.bankAccountNo,
    //       designation: user.designation,
    //       salary: parseFloat(user.salary),
    //       isVerified: false,
    //       isFired: false,
    //       createdAt: new Date(),
    //       updatedAt: new Date(),
    //     };

    //     // ... rest of your code
    //   } catch (error) {
    //     // ... error handling
    //   }
    // });
    app.post('/users', async (req, res) => {
      try {
        const user = req.body;

        // Validate required fields
        const requiredFields = [
          'name',
          'email',
          'role',
          'bankAccountNo',
          'designation',
          'salary',
          'image',
        ];
        const missingFields = requiredFields.filter(field => !user[field]);

        if (missingFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Missing required fields: ${missingFields.join(', ')}`,
          });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({
          email: user.email,
        });
        if (existingUser) {
          return res.status(400).json({
            success: false,
            message: 'User already exists',
          });
        }

        // Insert new user
        const result = await usersCollection.insertOne({
          ...user,
          salary: parseFloat(user.salary),
          isVerified: false,
          isFired: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        res.status(201).json({
          success: true,
          message: 'User created successfully',
          insertedId: result.insertedId,
        });
      } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    });
    // Helper function for URL validation
    function isValidUrl(string) {
      try {
        new URL(string);
        return true;
      } catch (_) {
        return false;
      }
    }
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
      const { email } = req.params;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const user = await usersCollection.findOne({ email });
      const isAdmin = user?.role === 'admin'; // Consistent with your DB structure

      res.send({ admin: isAdmin });
    });

    app.get('/user/hr/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }

      const user = await usersCollection.findOne({ email });
      const isHR = user?.role === 'HR'; // Case-sensitive match

      res.send({ hr: isHR });
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
    // Add these to your existing backend routes

    // Fire an employee
    app.patch(
      '/employee/fire/:id',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            isFired: true,
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Adjust salary (only allows increasing)
    app.patch(
      '/employee/salary/:id',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const { salary } = req.body;

        const employee = await usersCollection.findOne({
          _id: new ObjectId(id),
        });

        if (salary <= employee.salary) {
          return res
            .status(400)
            .send({ error: 'New salary must be higher than current salary' });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            salary: salary,
          },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );
    // Enhanced backend routes for payroll

    // 1. Get payroll records with additional filtering
    app.get('/payroll', verifyToken, verifyAdmin, async (req, res) => {
      try {
        // Optional query parameters for filtering
        const { status, month, year } = req.query;

        const filter = {};
        if (status) filter.status = status;
        if (month) filter.month = month;
        if (year) filter.year = parseInt(year);

        // Fetch payroll data with employee details
        const payrolls = await payrollCollection
          .aggregate([
            { $match: filter },
            {
              $lookup: {
                from: 'users',
                localField: 'employeeId',
                foreignField: '_id',
                as: 'employee',
              },
            },
            { $unwind: '$employee' },
            {
              $project: {
                _id: 1,
                name: '$employee.name',
                designation: '$employee.designation',
                photo: '$employee.photo',
                salary: 1,
                month: 1,
                year: 1,
                status: 1,
                paymentDate: 1,
                createdAt: 1,
              },
            },
            { $sort: { createdAt: -1 } },
          ])
          .toArray();

        res.status(200).json(payrolls);
      } catch (error) {
        res.status(500).send({ message: 'Failed to fetch payrolls', error });
      }
    });

    // 2. Process payment with additional validation
    app.patch('/payroll/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const { id } = req.params;
        const paymentDate = new Date();

        // Check if payment already exists for this period
        const payroll = await payrollCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!payroll) {
          return res.status(404).send({ message: 'Payroll record not found' });
        }

        if (payroll.status === 'Paid') {
          return res
            .status(400)
            .send({ message: 'This payment has already been processed' });
        }

        // Check for duplicate payments for same employee in same period
        const duplicatePayment = await payrollCollection.findOne({
          employeeId: payroll.employeeId,
          month: payroll.month,
          year: payroll.year,
          status: 'Paid',
          _id: { $ne: new ObjectId(id) },
        });

        if (duplicatePayment) {
          return res.status(400).send({
            message: 'This employee has already been paid for this period',
          });
        }

        // Update the payroll status
        const updateDoc = {
          $set: {
            status: 'Paid',
            paymentDate: paymentDate,
            processedBy: req.user.email,
          },
        };

        const result = await payrollCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        if (result.modifiedCount > 0) {
          // Create a payment record in the database
          await paymentsCollection.insertOne({
            employeeId: payroll.employeeId,
            payrollId: new ObjectId(id),
            amount: payroll.salary,
            month: payroll.month,
            year: payroll.year,
            paymentDate: paymentDate,
            processedBy: req.user.email,
            createdAt: new Date(),
          });

          res.send({
            message: 'Payment processed successfully',
            paymentDate: paymentDate.toISOString(),
          });
        } else {
          res.status(400).send({ message: 'Failed to process payment' });
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

    // ✅ Improved API: Fetch Employee Payment History
    app.get('/payment-history', verifyToken, async (req, res) => {
      try {
        const employeeId = req.user.id; // Get logged-in employee ID from JWT

        // Validate and parse query parameters
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const year = req.query.year ? parseInt(req.query.year) : null;
        const search = req.query.search || '';

        // Build the base query
        const query = {
          employeeId: new ObjectId(employeeId),
          status: 'Paid', // Only show completed payments
        };

        // Apply filters if provided
        if (year) {
          query.year = year;
        }

        if (search) {
          query.transactionId = {
            $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
            $options: 'i',
          };
        }

        // Get total count for pagination
        const totalPayments = await payrollCollection.countDocuments(query);

        // Calculate total pages
        const totalPages = Math.ceil(totalPayments / limit);

        // Fetch paginated payment history with proper sorting
        const payments = await payrollCollection
          .find(query)
          .sort({ year: 1, month: 1, paymentDate: -1 }) // Sort by year, month (ascending), then payment date (newest first)
          .skip((page - 1) * limit)
          .limit(limit)
          .project({
            _id: 1,
            month: 1,
            year: 1,
            salary: 1,
            transactionId: 1,
            paymentDate: 1,
          })
          .toArray();

        // Format the response data
        const responseData = payments.map(payment => ({
          id: payment._id,
          month: payment.month,
          year: payment.year,
          amount: payment.salary,
          transactionId: payment.transactionId,
          paymentDate: payment.paymentDate,
        }));

        res.status(200).json({
          success: true,
          data: responseData,
          pagination: {
            currentPage: page,
            totalPages,
            totalPayments,
            hasNextPage: page < totalPages,
            hasPreviousPage: page > 1,
          },
        });
      } catch (error) {
        console.error('Error in /payment-history:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch payment history',
          error: process.env.NODE_ENV === 'development' ? error.message : null,
        });
      }
    });

    // HR Routes
    // ✅ 1. Get All Employees (HR Only)

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

    // Get Employee Details
    app.get('/employee-details/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Handle both ObjectId and email
        let query;
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { email: id };
        }

        const employee = await usersCollection.findOne(query, {
          projection: {
            password: 0, // Exclude sensitive fields
          },
        });

        if (!employee) {
          return res.status(404).json({
            success: false,
            message: 'Employee not found',
          });
        }

        res.json({
          success: true,
          data: {
            ...employee,
            // Ensure all required fields exist
            designation: employee.designation || 'Not specified',
            salary: employee.salary || 0,
            bankAccountNo: employee.bankAccountNo || 'Not provided',
            isVerified: employee.isVerified || false,
          },
        });
      } catch (error) {
        console.error('Error fetching employee details:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch employee details',
        });
      }
    });

    // Get Employee Salary History
    app.get('/employee-salary/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;

        // Find employee first to get their ID if email was used
        let employee;
        if (ObjectId.isValid(id)) {
          employee = await usersCollection.findOne({ _id: new ObjectId(id) });
        } else {
          employee = await usersCollection.findOne({ email: id });
        }

        if (!employee) {
          return res.status(404).json({
            success: false,
            message: 'Employee not found',
          });
        }

        // Get salary history from payroll collection
        const salaryHistory = await payrollCollection
          .find({
            employeeId: employee._id,
            status: 'Paid',
          })
          .sort({ year: 1, month: 1 }) // Sort chronologically
          .project({
            month: 1,
            year: 1,
            salary: 1,
            paymentDate: 1,
            _id: 0,
          })
          .toArray();

        res.json({
          success: true,
          data: salaryHistory.map(item => ({
            ...item,
            salary: Number(item.salary), // Ensure numeric value
          })),
        });
      } catch (error) {
        console.error('Error fetching salary history:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to fetch salary history',
        });
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
