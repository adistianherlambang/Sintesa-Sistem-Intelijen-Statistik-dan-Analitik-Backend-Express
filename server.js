import express, { response } from "express";
import cors from "cors";
import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv"

//api
import api from "./api/api.js";

dotenv.config()

//konek MONGODB
await mongoose.connect(process.env.MONGO_URL)
console.log("Mongodb Connected")

const app = express();
app.use(cors());
app.use(express.json())

app.use("/api", api);


const port = process.env.PORT
app.listen(port, () => {
  console.log("App jalan di ", port);
});
