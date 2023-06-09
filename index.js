const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const jwt = require("jsonwebtoken");
const cors = require("cors");
const morgan = require("morgan");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const nodemailer = require("nodemailer");
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2cofc5d.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyJwt = (req, res, next) => {
  const authorization = req.headers.authorization;
  console.log(authorization);

  if (!authorization) {
    return res.status(401).send({ message: "Unauthorized Access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
  });
  next();
};

// email sender
const sendMail = (emailData, emailAddress) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL,
      pass: process.env.PASS,
    },
  });
  const mailOptions = {
    from: process.env.EMAIL,
    to: emailAddress,
    subject: emailData.subject,
    html: `<p>${emailData?.message}</p>`,
  };

  transporter.sendMail(mailOptions, (err, info) => {
    if (err) {
      console.log(err);
    } else {
      console.log("Email sent: " + info.response);
    }
  });
};

async function run() {
  try {
    const roomsCollection = client.db("airCncDb").collection("rooms");
    const usersCollection = client.db("airCncDb").collection("users");
    const bookingsCollection = client.db("airCncDb").collection("bookings");

    // generate client secret

    // verify host
    const verifyHost = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      console.log(decodedEmail);
      const query = { email: decodedEmail };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "host") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access" });
      }
      next();
    };

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    // create payment intent
    app.post("/create-payment-intent", verifyJwt, async (req, res) => {
      const { price } = req.body;
      const amount = parseFloat(price) * 100;
      if (!price) return;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });
    // jwt process

    app.post("/jwt", (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({ token });
    });
    // save user email and role in db
    app.put("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user,
      };
      const result = await usersCollection.updateOne(query, updateDoc, options);
      res.send(result);
    });
    // get all rooms from db
    app.get("/rooms", async (req, res) => {
      const result = await roomsCollection.find().toArray();
      res.send(result);
    });

    // get single room details
    app.get("/rooms/:id", async (req, res) => {
      const id = req.params.id;

      const result = await roomsCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });
    // post room data to the server
    app.post("/rooms", verifyJwt, verifyHost, async (req, res) => {
      const roomInfo = req.body;
      const result = await roomsCollection.insertOne(roomInfo);
      res.send(result);
    });

    app.put("/rooms/:id", verifyJwt, async (req, res) => {
      const room = req.body;
      console.log(room);

      const filter = { _id: new ObjectId(req.params.id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: room,
      };
      const result = await roomsCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
    // get host added rooms
    app.get("/rooms/host/:email", verifyJwt, async (req, res) => {
      const decodedEmail = req.decoded.email;
      const email = req.params.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      const result = await roomsCollection
        .find({ "host.email": email })
        .toArray();

      res.send(result);
    });
    // delete room api
    app.delete("/rooms/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };

      const result = await roomsCollection.deleteOne(query);
      res.send(result);
    });

    // post bookings details in the db
    app.post("/bookings", async (req, res) => {
      const bookingInfo = req.body;
      // Send confirmation email to guest
      const result = await bookingsCollection.insertOne(bookingInfo);
      sendMail(
        {
          subject: "Booking Successful!",
          message: `Booking Id: ${result?.insertedId}, TransactionId: ${bookingInfo.transactionId}`,
        },
        bookingInfo?.guest?.email
      );
      // Send confirmation email to host
      sendMail(
        {
          subject: "Your room got booked!",
          message: `Booking Id: ${result?.insertedId}, TransactionId: ${bookingInfo.transactionId}. Check dashboard for more info`,
        },
        bookingInfo?.host
      );

      res.send(result);
    });

    // get bookings details from db
    app.get("/bookings/:email", async (req, res) => {
      const email = req.params.email;
      if (!email) {
        res.send([]);
      }
      const query = { "guest.email": email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    // delete a booking
    app.delete("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookingsCollection.deleteOne(query);
      res.send(result);
    });

    // update room booking status
    app.patch("/rooms/status/:id", async (req, res) => {
      const id = req.params.id;
      const status = req.body.status;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          booked: status,
        },
      };
      const update = await roomsCollection.updateOne(query, updateDoc);
      res.send(update);
    });

    // get user information
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email: email });
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Database connected");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Server is busy");
});

app.listen(port, () => {
  console.log("Server running at port", port);
});
