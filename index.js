const puppeteer = require("puppeteer");
const fs = require("fs/promises");

const WEBSITE_URL = "https://dev-shop-integration.alerabat.com/";
const ERROR_FILE_NAME = "error.txt";
const WORKING_CODES_FILE_NAME = "workingCodes.txt";
const BEST_CODE_FILE_NAME = "bestCode.txt";
const MAX_WAITING_TIME = 10000;
const NUMBER_REGEXP = /\d+/;
const SUCCESS_PARAGRAPH_SELECTOR = '::-p-xpath(//p[text()="Kod rabatowy: -"])';
const FAILURE_PARAGRAPH_SELECTOR =
  '::-p-xpath(//p[text()="Nieprawidłowy kod rabatowy"])';

const codes = new Set([
  "RABAT10",
  "RABAT20",
  "DISCOUNT50",
  "PROMO25",
  "SALE30",
  "BONUS15",
  "SHOP5",
  "EXTRA40",
  "WELCOME2024",
  "VIPDEAL",
]);

(async () => {
  let browser = null;

  try {
    const workingCodes = new Set();
    let bestCode = null;

    //Switch headless to false for chrome graphical mode
    browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.goto(WEBSITE_URL);

    const clearInput = () => page.$eval("input", (it) => (it.value = ""));
    const fillInput = (code) => page.locator("input").fill(code);
    const clickApplyButton = () => page.locator("button").click();

    for (const code of codes) {
      console.log(`Testing code: ${code}`);

      //1. Enter code
      await fillInput(code);
      //2. Click apply button
      await clickApplyButton();

      //Abort controller for early termination of unnecessary asynchronous operations
      const abortController = new AbortController();
      const signal = abortController.signal;

      const waitForSuccessParagraph = async () => {
        const paragraph = await page
          .locator(SUCCESS_PARAGRAPH_SELECTOR)
          .setTimeout(MAX_WAITING_TIME)
          .waitHandle({ signal });

        const text = await paragraph.evaluate((it) => it.textContent);

        return {
          status: "success",
          discount: parseInt(text.match(NUMBER_REGEXP)),
        };
      };

      const waitForFailureParagraph = async () => {
        await page
          .locator(FAILURE_PARAGRAPH_SELECTOR)
          .setTimeout(MAX_WAITING_TIME)
          .wait({ signal });

        return { status: "failed" };
      };

      const result = await Promise.any([
        waitForSuccessParagraph().then((res) => {
          abortController.abort();
          return res;
        }),
        waitForFailureParagraph().then((res) => {
          abortController.abort();
          return res;
        }),
      ]);

      if (result.status === "success") {
        workingCodes.add(code);
        bestCode = findBetterCode(bestCode, code, result.discount);
      }

      //3. clear input
      await clearInput();

      //4. reset form by clicking apply button when input is empty
      await clickApplyButton();
    }

    if (workingCodes.size > 0) {
      await fs.writeFile(
        WORKING_CODES_FILE_NAME,
        Array.from(workingCodes).join("\r\n")
      );
    }

    if (bestCode) {
      await fs.writeFile(
        BEST_CODE_FILE_NAME,
        `Best code is: ${bestCode.code}, that gives you discount: ${bestCode.discount} pln.`
      );
    }

    await browser.close();
  } catch (e) {
    console.error(e);
    await fs.writeFile(ERROR_FILE_NAME, `Error: \r\n${e}`);
    // add logger logic here
    if (browser) {
      browser.close();
    }
  }
})();

const findBetterCode = (currentBest, newCode, newDiscount) => {
  if (!currentBest || currentBest.discount < newDiscount) {
    return { code: newCode, discount: newDiscount };
  }
  return currentBest;
};
