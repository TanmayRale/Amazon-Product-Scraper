import express,{Request, Response} from "express";
import puppeteer from "puppeteer";
import bodyparser from "body-parser";
import cors from "cors";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config()


const app=express();
const port=5000;

let pool: mysql.Pool;

async function CreateDbTable() {
    try{
        const tempConnection=await mysql.createConnection({
            host:process.env.db_host,
            user:process.env.db_user,
            password:process.env.db_password
        })
    
        await tempConnection.query("create database if not exists scraping_database;");
        tempConnection.end()
        console.log("Successfully Connected to scraping database")

        pool=mysql.createPool({
            host:process.env.db_host,
            user:process.env.db_user,
            password:process.env.db_password,
            database:"scraping_database",
            waitForConnections:true,
            connectionLimit:10,
            queueLimit:0
        })

        await pool.query("create table if not exists amazon_product_scraping_data (id int auto_increment primary key, url text not null, title varchar(200) not null, bullet_points json not null, price varchar(100) not null, image_links json not null, scraped_at timestamp default current_timestamp);")
        console.log("Table is ready")

    }
    catch(error)
    {
        console.log("Error :- ",error)
    }
}


CreateDbTable();

async function insertScrapedData(url:string,title:string|undefined,bullet_points:(string|undefined)[],price:string|undefined,image_links:(string|undefined)[]){
    try{
        const query="insert into amazon_product_scraping_data (url,title,bullet_points,price,image_links,scraped_at) values(?,?,?,?,?,NOW())";

        await pool.execute(query,[
            url,
            title,
            JSON.stringify(bullet_points),
            price,
            JSON.stringify(image_links)
        ])

        console.log("Scraped data inserted successfully")
    
    }
    catch(error)
    {
        console.log("Error :- ",error)
    }
}

async function fetchScrapedData(){
    try{
        const [rows] = await pool.execute("select * from amazon_product_scraping_data");
        return rows;
    }
    catch(error)
    {
        console.log("Error :- ",error)
    }
}

app.use(cors());
app.use(bodyparser.json());
app.post("/scrape",async (req : Request ,res : Response)=>{
    try{
        const { url }= req.body

        if(!url)
        {
            res.status(400).json({error : "Invalid Url"})
        }
        else if(!url.includes("amazon."))
        {
            res.status(400).json({error : "Invalid Amazon Url"})
        }
        
        const browser = await puppeteer.launch({headless: true});
        const page= await browser.newPage();

        await page.goto(url, { timeout: 60000, waitUntil: 'domcontentloaded' })

        console.log("scraping Title...")
        const title:string | undefined= await page.$eval("#productTitle",(element)=>{
            
            return element.textContent?.trim()
        })
        console.log("Title Scraped Successfully!")


        console.log("scraping price...")
        const price_symbol:string | undefined= await page.$eval(".a-price-symbol",(element)=>{   
            return element.textContent?.trim()
        })

        const price_whole:string | undefined= await page.$eval(".a-price-whole",(element)=>{
            return element.textContent?.trim()
        })

        const price_fraction:string | undefined= await page.$eval(".a-price-fraction",(element)=>{
            
            return element.textContent?.trim() || ''
        })

        const price:string | undefined=`${price_symbol}${price_whole}${price_fraction}`
        console.log("Price scraped Successfully!")

        console.log("scraping bullet points...")
        const bullet_points:(string | undefined)[]= await page.evaluate(()=>{
            
            return Array.from(document.querySelectorAll(".a-unordered-list .a-spacing-mini .a-list-item"))
            .map((element)=>{
                return element.textContent?.trim()
            })
            .filter((text)=>{
                return text
            })
        })
        console.log("Bullet Points scraped Successfully!")


        console.log("scraping images...")
        const images:(string | undefined)[]= await page.evaluate(()=>{
            
            return Array.from(document.querySelectorAll("#altImages img"))
            .map((element)=>{
                return element.getAttribute("src")
            })
            .filter((src)=>{
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
                return src && !unwantedPatterns.some((pattern) =>{return src.includes(pattern)})
            })
            .map((src)=>{
                return src?.replace(/_SS40_/g, '_SL1500_')
                .replace(/_SS100_/g, '_SL1500_')
                .replace(/_AC_US40_/g, '_AC_SL1500_')
                .replace(/_SX\d+_/g, '_SL1500_')
                .replace(/_SY\d+_/g, '_SL1500_')
                .replace(/_UX\d+_/g, '_SL1500_')
                .replace(/_UY\d+_/g, '_SL1500_')
            })
        })
        console.log("Images scraped successfully!")


        const scraped_at=new Date().toISOString()

        await browser.close()

        if(!title  || title.trim() === "" || !price  || price.trim() === "" || !bullet_points  || bullet_points.length === 0 || !images  || images.length === 0)
        {
            res.status(400).json({
                success:false,
                error: "Scraping Failed : Some fields Are missing",
                details:{title,price,bullet_points,images}
            })
        }

        res.json({url,title,bullet_points,price,images,scraped_at})
        insertScrapedData(url,title,bullet_points,price,images)

    }
    catch(error)
    {
        console.log("Scraping Error :( :- ",error)
        res.status(500).json({error : "Failed to scrape the product"})
    }
})

app.get("/products", async (req: Request,res: Response)=>{
  try{
    const products=await fetchScrapedData();
    res.json({
        data: products
    })
  }
  catch(error)
  {
    res.status(500).json({
        success:false,
        message:"Error :- ",error
    })

    console.log("Error :- ",error)
  }  
})

app.listen(port,()=>{
    console.log("Server listening at port 5000")
})