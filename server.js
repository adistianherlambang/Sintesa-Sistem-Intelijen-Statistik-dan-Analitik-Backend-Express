import express, { response } from "express";
import cors from "cors";
import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import https from "https";

//api
import api from "./api/api.js";

dotenv.config();

//konek MONGODB
await mongoose.connect(process.env.MONGO_URL);
console.log("Mongodb Connected");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api", api);

const url =
  "https://webapi.bps.go.id/v1/api/list/model/data/lang/ind/domain/0000/var/2245/th/126/key/6140cf4d3d3cc537fe36176ad6ad09d2/";

app.post("/test", async (req, res) => {
  try {
    const response = await fetch(url, {
      httpsAgent: new https.Agent({ keepAlive: true }),
      headers: {
        "User-Agent": "...",
        Accept: "application/json, text/plain, */*",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      return res.status(response.status).json({
        message: `gagal dengan ${response.status}`,
        body: text,
      });
    }

    const text = await response.text();

    if (!text) {
      return res.status(500).json({
        message: "empty response",
      });
    }

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return res.status(500).json({
        message: "invalid JSON response",
        raw: text,
      });
    }

    return res.json(data);
  } catch (err) {
    return res.status(500).json({
      message: err.message,
    });
  }
});

const port = process.env.PORT;
app.listen(port, () => {
  console.log("App jalan di ", port);
});
