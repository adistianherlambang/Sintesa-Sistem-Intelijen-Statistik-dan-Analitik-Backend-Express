import axios from "axios";
import fs from "fs"
import path from "path";

//models
import APIDataBPS from "../db/models/APIDataBPS"

const configPath = path.resolve("../json/fetchBPS.json")

export const fetchBPS = async () => {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    const url = config.url

    const res = await axios.get(url)
    const data = res.data

    await APIDataBPS.findOneAndUpdate(
      { status: data.status },
      {
        ...data,
        lastUpdate: new Date(data.last_update),
      },
      { upsert: true, new: true }
    )
    console.log("BPS data updated")
  } catch(err) {
    console.error("Fetch error: ", err.message)
  }
}