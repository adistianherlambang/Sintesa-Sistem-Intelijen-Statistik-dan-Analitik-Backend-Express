import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

import APIDataBPS from "../db/models/APIDataBPS.js";

dotenv.config({
  path: path.resolve("../.env"),
});

const MONGO_URL = process.env.MONGO_URL;
await mongoose.connect(MONGO_URL);

export const AISummary = async () => {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        contents: [
          {
            parts: [
              {
                text: "Explain how AI works in 8000 token in bahasa indonesia, with \\n for break, and each paragraph ",
              },
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-goog-api-key": process.env.GEMINI_API_KEY,
        },
      },
    );

    console.log(res.data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error(err.message);
  }
};

AISummary();
