"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const body_parser_1 = __importDefault(require("body-parser"));
const cors_1 = __importDefault(require("cors"));
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = 5000;
let pool;
function CreateDbTable() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const tempConnection = yield promise_1.default.createConnection({
                host: process.env.db_host,
                user: process.env.db_user,
                password: process.env.db_password
            });
            yield tempConnection.query("create database if not exists scraping_database;");
            tempConnection.end();
            console.log("Successfully Connected to scraping database");
            pool = promise_1.default.createPool({
                host: process.env.db_host,
                user: process.env.db_user,
                password: process.env.db_password,
                database: "scraping_database",
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0
            });
            yield pool.query("create table if not exists amazon_product_scraping_data (id int auto_increment primary key, url text not null, title varchar(200) not null, bullet_points json not null, price varchar(100) not null, image_links json not null, scraped_at varchar(50) not null);");
            console.log("Table is ready");
        }
        catch (error) {
            console.log("Error :- ", error);
        }
    });
}
CreateDbTable();
function insertScrapedData(url, title, bullet_points, price, image_links, scraped_at) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const query = "insert into amazon_product_scraping_data (url,title,bullet_points,price,image_links,scraped_at) values(?,?,?,?,?,?)";
            yield pool.execute(query, [
                url,
                title,
                JSON.stringify(bullet_points),
                price,
                JSON.stringify(image_links),
                scraped_at
            ]);
            console.log("Scraped data inserted successfully");
        }
        catch (error) {
            console.log("Error :- ", error);
        }
    });
}
function fetchScrapedData() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log("Fetching the stored data.");
            const [rows] = yield pool.execute("select * from amazon_product_scraping_data");
            console.log("Successfully fetched stored data.");
            return rows;
        }
        catch (error) {
            console.log("Error :- ", error);
        }
    });
}
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.post("/scrape", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { url } = req.body;
        if (!url) {
            res.status(400).json({ error: "Invalid Url" });
        }
        else if (!url.includes("amazon.")) {
            res.status(400).json({ error: "Invalid Amazon Url" });
        }
        const browser = yield puppeteer_1.default.launch({ headless: true });
        const page = yield browser.newPage();
        yield page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' });
        console.log("scraping Title...");
        const title = yield page.$eval("#productTitle", (element) => {
            var _a;
            return (_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim();
        });
        console.log("Title Scraped Successfully!");
        console.log("scraping price...");
        const price_symbol = yield page.$eval(".a-price-symbol", (element) => {
            var _a;
            return (_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim();
        });
        const price_whole = yield page.$eval(".a-price-whole", (element) => {
            var _a;
            return (_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim();
        });
        const price_fraction = yield page.$eval(".a-price-fraction", (element) => {
            var _a;
            return ((_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim()) || '';
        });
        const price = `${price_symbol}${price_whole}${price_fraction}`;
        console.log("Price scraped Successfully!");
        console.log("scraping bullet points...");
        const bullet_points = yield page.evaluate(() => {
            return Array.from(document.querySelectorAll(".a-unordered-list .a-spacing-mini .a-list-item"))
                .map((element) => {
                var _a;
                return (_a = element.textContent) === null || _a === void 0 ? void 0 : _a.trim();
            })
                .filter((text) => {
                return text;
            });
        });
        console.log("Bullet Points scraped Successfully!");
        console.log("scraping images...");
        const images = yield page.evaluate(() => {
            return Array.from(document.querySelectorAll("#altImages img"))
                .map((element) => {
                return element.getAttribute("src");
            })
                .filter((src) => {
                const unwantedPatterns = [
                    "360",
                    "360_icon",
                    "sprite-image",
                    "PKdp-play-icon-overlay__",
                    "PKplay-button-mb-image-grid-small_",
                    "dp-play-icon-overlay",
                    "video-thumb",
                    "videoIcon",
                    "_FMpng_",
                    "_FMjpg_"
                ];
                return src && !unwantedPatterns.some((pattern) => { return src.includes(pattern); });
            })
                .map((src) => {
                return src === null || src === void 0 ? void 0 : src.replace(/_SS40_/g, '_SL1500_').replace(/_SS100_/g, '_SL1500_').replace(/_AC_US40_/g, '_AC_SL1500_').replace(/_SX\d+_/g, '_SL1500_').replace(/_SY\d+_/g, '_SL1500_').replace(/_UX\d+_/g, '_SL1500_').replace(/_UY\d+_/g, '_SL1500_');
            });
        });
        console.log("Images scraped successfully!");
        const scraped_at = new Date().toISOString();
        yield browser.close();
        if (!title || title.trim() === "" || !price || price.trim() === "" || !bullet_points || bullet_points.length === 0 || !images || images.length === 0) {
            res.status(400).json({
                success: false,
                error: "Scraping Failed : Some fields Are missing",
                details: { title, price, bullet_points, images }
            });
        }
        res.json({ url, title, bullet_points, price, images, scraped_at });
        insertScrapedData(url, title, bullet_points, price, images, scraped_at);
    }
    catch (error) {
        console.log("Scraping Error :( :- ", error);
        res.status(500).json({ error: "Failed to scrape the product" });
    }
}));
app.get("/products", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const products = yield fetchScrapedData();
        res.json({
            data: products
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error :- ", error
        });
        console.log("Error :- ", error);
    }
}));
app.listen(port, () => {
    console.log("Server listening at port 5000");
});
