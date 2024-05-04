import { Sequelize, DataTypes, Op } from "sequelize";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const API_KEY = "";
let LAST_CE_API_CALL_TIMESTAMP = 0;
const playerLevelMap = new Map();

let BSRecord = null;
await initDB();

const app = express();
const port = 3000;
app.use(express.json());
app.use(cors());
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

app.get("/status", (req, res) => {
    console.log("GET: " + req.originalUrl);
    res.status(200).json({ httpStatus: 200 });
});

app.get("/", async (req, res) => {
    console.log("GET: " + req.originalUrl);
    const spyData = await db_select_all_spy_records();
    for (const spy of spyData) {
        spy.level = await getPlayerLevel(spy.targetId);
    }
    spyData.sort((a, b) => {
        if (a.level < b.level) {
            return 1;
        }
        if (a.level > b.level) {
            return -1;
        }
        return 0;
    });
    res.render("spy-list", { title: "Spy List", spyData: spyData });
});

app.get("/api/spy/", async (req, res) => {
    console.log("GET: " + req.originalUrl);
    const userid = req.query.userid;
    if (!userid) {
        res.status(200).json({ httpStatus: 400, success: false, message: "查询参数错误" });
        return;
    }
    const result = await db_select_targetId(userid);
    res.status(200).json({ httpStatus: 200, success: true, result: result });
});

app.post("/api/spy/upload/", async (req, res) => {
    console.log("POST: " + req.originalUrl);
    const json = req.body;
    console.log(json);
    if (!json || !json.targetId || !json.bs || !json.logId) {
        res.status(200).json({ httpStatus: 400, success: false, message: "上传参数错误" });
        return;
    }
    console.log(json);
    const result = await db_insert_spy_record(json);
    if (result) {
        res.status(200).json({ httpStatus: 200, success: true, message: "上传成功" });
    } else {
        res.status(200).json({ httpStatus: 500, success: false, message: "未能写入数据库，注意同一log只能上传一次" });
    }
});

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

async function initDB() {
    const sequelize = new Sequelize({
        dialect: "sqlite",
        storage: "databases/bsrecords.db",
    });

    BSRecord = sequelize.define(
        "BSRecord",
        {
            id: {
                type: DataTypes.INTEGER,
                autoIncrement: true,
                primaryKey: true,
            },
            reporterId: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            reporterName: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            targetId: {
                type: DataTypes.STRING,
                allowNull: false, // Must have
            },
            targetName: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            bs: {
                type: DataTypes.STRING,
                allowNull: false, // Must have
            },
            logId: {
                type: DataTypes.STRING,
                allowNull: false, // Must have
                unique: true, // Unique
            },
            logTimestamp: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            reportTimestamp: {
                type: DataTypes.STRING,
                allowNull: true,
            },
            reportSource: {
                type: DataTypes.STRING,
                allowNull: true,
            },
        },
        { logging: false }
    );

    try {
        await sequelize.authenticate();
        console.log("DB Connected");
    } catch (error) {
        console.error("Unable to connect to the database: ", error);
    }

    try {
        await BSRecord.sync({ alter: true });
        console.log("DB BSRecord model synced");
    } catch (error) {
        console.error(error);
    }
}

async function db_select_targetId(targetId) {
    return await BSRecord.findAll({
        where: {
            targetId: {
                [Op.eq]: targetId,
            },
        },
    });
}

async function db_insert_spy_record(json) {
    try {
        await BSRecord.create(json);
        console.log("DB inserted");
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

async function db_select_all_spy_records() {
    return await BSRecord.findAll({});
}

async function getPlayerLevel(playerId) {
    let level = playerLevelMap.get(playerId);
    if (!level) {
        level = await CE_API_fetchPlayerLevel(playerId);
        if (level && level > 0) {
            playerLevelMap.set(playerId, level);
        }
    }
    return level;
}

async function CE_API_fetchPlayerLevel(playerId) {
    const waitMs = 700 - Date.now() + LAST_CE_API_CALL_TIMESTAMP;
    if (waitMs > 0) {
        console.log(waitMs)
        await sleep(waitMs);
    }
    LAST_CE_API_CALL_TIMESTAMP = Date.now();
    console.log("CE_API_fetchPlayerLevel");
    const response = await fetch(`https://cartelempire.online/api/user?id=${playerId}&type=basic&key=${API_KEY}`);
    if (!response) {
        return -1;
    }
    const json = await response.json();
    if (json.error && json.error.includes("User does not exist")) {
        return -1;
    }
    if (!json || !json.userId === playerId) {
        return -1;
    }
    return json.level;
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}
