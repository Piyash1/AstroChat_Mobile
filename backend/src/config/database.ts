import mongoose from "mongoose";
import dns from "node:dns";

const dnsServers = process.env.DNS_SERVERS;
if (dnsServers) {
  dns.setServers(dnsServers.split(",").map((s) => s.trim()));
}

export const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MongoDB URI not found");
    }

    await mongoose.connect(mongoUri);
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌MongoDB connection error:", error);
    throw error; // let the caller handle the error
  }
};
