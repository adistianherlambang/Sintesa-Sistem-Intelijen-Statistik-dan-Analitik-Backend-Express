import mongoose from "mongoose";

export const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) {
    return mongoose.connection;
  }

  const uri =
    process.env.MONGODB_URI ||
    process.env.MONGO_URL ||
    "mongodb://localhost:27017/sintesa";

  const options = {
    dbName: process.env.MONGODB_DB_NAME || "sintesa",
  };

  if (process.env.MONGODB_USERNAME && process.env.MONGODB_PASSWORD) {
    options.auth = {
      username: process.env.MONGODB_USERNAME,
      password: process.env.MONGODB_PASSWORD,
    };
  }

  await mongoose.connect(uri, options);
  console.log(`✔ MongoDB connected (${mongoose.connection.name})`);
  return mongoose.connection;
};

export default connectDB;
