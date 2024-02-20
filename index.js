const cors = require("cors");
const express = require("express");
const puppeteer = require("puppeteer");
const app = express();
const port = process.env.PORT || 3000;
app.use(cors());
app.get("/", (req, res) => {
  res.status(200).send("Backend is running!");
});

async function scrapeAmazon(keyword) {
  const browser = await puppeteer.launch({
    defaultViewport: null,
  });
  const page = await browser.newPage();
  await page.goto(`https://www.amazon.in/s?k=${keyword}`);
  const products = await page.evaluate(() => {
    const productList = [];
    const items = document.querySelectorAll(
      'div[data-component-type="s-search-result"]'
    );
    const itemsArray = Array.from(items);
    const firstFourItems = itemsArray.slice(0, 4);

    firstFourItems.forEach(async (item) => {
      const attributes = {};
      if (item) {
        for (let attr of item.attributes) {
          attributes[attr.name] = attr.value;
        }
      }
      const innerUrl = `https://www.amazon.in/product-reviews/${attributes["data-asin"]}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
      const nameElement = item.querySelector("h2");
      const descriptionElement = item.querySelector(
        "h2.a-size-mini.a-color-base"
      );
      const ratingElement = item.querySelector(".a-icon-star-small");
      const reviewsElement = item.querySelector(
        ".a-size-base.a-color-secondary"
      );
      const priceElement = item.querySelector(".a-price span");

      const productName = nameElement ? nameElement.innerText.trim() : "N/A";
      const productDescription = descriptionElement
        ? descriptionElement.innerText.trim()
        : "N/A";
      const productRating = ratingElement
        ? ratingElement.innerText.split(" ")[0]
        : "N/A";
      const productReviews = reviewsElement ? reviewsElement.innerText : "N/A";
      const productPrice = priceElement ? priceElement.innerText : "N/A";

      productList.push({
        productName,
        productDescription,
        productRating,
        productReviews,
        productPrice,
        innerUrl,
      });
    });
    return productList;
  });

  const updatedProducts = await Promise.all(
    products.map(async (product) => {
      const page = await browser.newPage();
      await page.goto(product.innerUrl);
      const { topReviews, reviewCount } = await page.evaluate(() => {
        const reviewItems = document.querySelectorAll(
          'div[data-hook="review"]'
        );
        const reviewItemsArray = Array.from(reviewItems);
        const topReviews = reviewItemsArray.map((item) => {
          return item.querySelector(
            ".a-size-base.review-text.review-text-content"
          ).innerText;
        });
        const reviewElement = document.querySelector(
          ".a-row.a-spacing-base.a-size-base"
        );
        const reviews = reviewElement
          ? reviewElement.innerHTML.split(", ")[1].split(" ")[0]
          : "N/A";
        return { topReviews, reviewCount: reviews };
      });
      product.productReviews = reviewCount;
      product.topReviews = topReviews;
      delete product.innerUrl;
      await page.close();
      return product;
    })
  );

  await browser.close();
  return updatedProducts;
}

app.get("/search", async (req, res) => {
  const keyword = req.query.keyword;
  if (!keyword) {
    res.status(400).json({ error: "Missing keyword parameter" });
    return;
  }

  try {
    const products = await scrapeAmazon(keyword);
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`App listening at http://localhost:${port}`);
});
