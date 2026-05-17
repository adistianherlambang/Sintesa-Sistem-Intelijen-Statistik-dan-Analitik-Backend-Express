import express, { response } from "express";
import cors from "cors";
import axios from "axios";

//api
import api from "./api/api.js";

const app = express();
app.use(cors());

app.use("/api", api);

app.listen(5000, () => {
  console.log("app jalan di 5000");
});
