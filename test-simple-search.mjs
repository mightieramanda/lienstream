import puppeteer from 'puppeteer';
import { execSync } from 'child_process';

// Install Chrome if needed
try {
  console.log('Installing Chrome...');
  execSync('npx puppeteer browsers install chrome', { stdio: 'inherit' });
} catch (e) {
  console.log('Chrome installation attempted');
}

async function simpleSearch() {
  console.log('Starting simple MEDICAL LN search test...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: '/home/runner/.cache/puppeteer/chrome/linux-139.0.7258.138/chrome-linux64/chrome'
  });
  
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    
    console.log('Navigating to Maricopa County Recorder...');
    await page.goto('https://recorder.maricopa.gov/recdocdata/', { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Wait for page to load
    await page.waitForTimeout(3000);
    
    // Select MEDICAL LN document type
    console.log('Selecting MEDICAL LN document type...');
    const docTypeSelector = '#ctl00_ContentPlaceHolder1_DocumentType';
    await page.waitForSelector(docTypeSelector);
    await page.select(docTypeSelector, 'HL'); // HL is the value for MEDICAL LN
    
    // Try to find and click ANY search button
    console.log('Looking for search buttons...');
    const searchButtons = await page.evaluate(() => {
      const buttons = [];
      // Find all buttons and inputs that might be search buttons
      document.querySelectorAll('button, input[type="button"], input[type="submit"]').forEach(btn => {
        const text = btn.textContent || btn.value || '';
        if (text.toLowerCase().includes('search')) {
          buttons.push({
            id: btn.id,
            text: text,
            type: btn.tagName,
            class: btn.className
          });
        }
      });
      return buttons;
    });
    
    console.log('Found search buttons:', searchButtons);
    
    // Click the first search button
    if (searchButtons.length > 0) {
      console.log(`Clicking search button: ${searchButtons[0].id}`);
      await page.click(`#${searchButtons[0].id}`);
    }
    
    // Wait for results or page change
    console.log('Waiting for response...');
    await page.waitForTimeout(10000);
    
    // Take screenshot
    await page.screenshot({ path: 'simple-search-test.png' });
    console.log('Screenshot saved to simple-search-test.png');
    
    // Check what's on the page now
    const pageState = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const url = window.location.href;
      const tables = document.querySelectorAll('table');
      
      // Look for any numbers that could be recording numbers
      const numbers = [];
      document.querySelectorAll('a, td').forEach(elem => {
        const text = elem.textContent?.trim() || '';
        if (text.match(/^\d{10,12}$/)) {
          numbers.push(text);
        }
      });
      
      return {
        url: url,
        tableCount: tables.length,
        possibleRecordingNumbers: numbers.slice(0, 20),
        pageChanged: !url.includes('recdocdata'),
        hasResults: bodyText.includes('results') || bodyText.includes('Records'),
        snippet: bodyText.substring(0, 1000)
      };
    });
    
    console.log('\n=== PAGE STATE AFTER SEARCH ===');
    console.log('URL:', pageState.url);
    console.log('Tables found:', pageState.tableCount);
    console.log('Page changed from search form:', pageState.pageChanged);
    console.log('Has results text:', pageState.hasResults);
    
    if (pageState.possibleRecordingNumbers.length > 0) {
      console.log(`\n✅ FOUND ${pageState.possibleRecordingNumbers.length} POSSIBLE RECORDING NUMBERS!`);
      console.log('Numbers:', pageState.possibleRecordingNumbers);
    } else {
      console.log('\n❌ NO RECORDING NUMBERS FOUND');
      console.log('Page snippet:', pageState.snippet);
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
    console.log('\nTest complete');
  }
}

simpleSearch();