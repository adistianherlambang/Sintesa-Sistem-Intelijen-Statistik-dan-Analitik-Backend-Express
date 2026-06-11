import mongoose from "mongoose";
import dotenv from "dotenv";
import ForecastResult from "../db/models/ForecastResult.js";

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URL);
  console.log("Connected to MongoDB");

  // Use raw MongoDB collection to bypass Mongoose schema validation/stripping
  const result = await ForecastResult.collection.updateMany(
    {},
    {
      $unset: {
        hyperparameters: "",
        loss_history: "",
        final_loss: "",
        epochs: "",
        lag: "",
        batch_size: "",
        learning_rate: "",
        dropout_rate: "",
        hidden_neurons: "",
      },
    },
  );

  console.log("Cleanup finished.");
  console.log(`Matched count: ${result.matchedCount}`);
  console.log(`Modified count: ${result.modifiedCount}`);

  await mongoose.disconnect();
};

run().catch(console.error);
