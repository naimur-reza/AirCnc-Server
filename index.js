const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2cofc5d.mongodb.net/?retryWrites=true&w=majority`;

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
    const roomsCollection = client.db("airCncDb").collection("rooms");
    const usersCollection = client.db("airCncDb").collection("users");
    const bookingsCollection = client.db("airCncDb").collection("bookings");

    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

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
    app.post("/rooms", async (req, res) => {
      const roomInfo = req.body;
      const result = await roomsCollection.insertOne(roomInfo);
      res.send(result);
    });

    // post bookings details in the db
    app.post("/bookings", async (req, res) => {
      const bookingInfo = req.body;
      const result = await bookingsCollection.insertOne(bookingInfo);
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
