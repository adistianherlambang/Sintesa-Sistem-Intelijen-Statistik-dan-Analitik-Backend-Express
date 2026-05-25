import axios from "axios";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

import APIDataBPS from "../db/models/APIDataBPS.js";

dotenv.config({
  path: path.resolve("../.env"),
});

export const AISummary = async () => {
  try {
    const res = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        contents: [
          {
            parts: [
              {
                text: "",
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
