const puppeteer = require('puppeteer');

async function testSearch() {
  console.log('Starting test search for 08/22/2025...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
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
    
    // Set date to 08/22/2025
    console.log('Setting dates to 08/22/2025...');
    
    // Clear and set start date
    const startDateField = '#ctl00_ContentPlaceHolder1_txtRecordingDateFrom';
    await page.click(startDateField, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(startDateField, '08/22/2025');
    
    // Clear and set end date
    const endDateField = '#ctl00_ContentPlaceHolder1_txtRecordingDateTo';
    await page.click(endDateField, { clickCount: 3 });
    await page.keyboard.press('Backspace');
    await page.type(endDateField, '08/22/2025');
    
    // Click search button
    console.log('Clicking search button...');
    const searchButton = '#ctl00_ContentPlaceHolder1_btnSearchPanel1';
    await page.click(searchButton);
    
    // Wait for results
    console.log('Waiting for results...');
    await page.waitForTimeout(10000);
    
    // Take screenshot
    await page.screenshot({ path: 'test-search-results.png' });
    console.log('Screenshot saved to test-search-results.png');
    
    // Check what's on the page
    const pageContent = await page.evaluate(() => {
      const bodyText = document.body.innerText || '';
      const tables = document.querySelectorAll('table');
      const links = document.querySelectorAll('a');
      
      // Look for recording numbers
      const recordingNumbers = [];
      links.forEach(link => {
        const text = link.textContent?.trim() || '';
        if (text.match(/^\d{10,12}$/)) {
          recordingNumbers.push(text);
        }
      });
      
      return {
        url: window.location.href,
        title: document.title,
        tableCount: tables.length,
        linkCount: links.length,
        recordingNumbers: recordingNumbers,
        hasNoResults: bodyText.includes('No records') || bodyText.includes('0 results'),
        pageSnippet: bodyText.substring(0, 1000)
      };
    });
    
    console.log('Page analysis:', JSON.stringify(pageContent, null, 2));
    
    if (pageContent.recordingNumbers.length > 0) {
      console.log(`\n✅ FOUND ${pageContent.recordingNumbers.length} RECORDING NUMBERS!`);
      console.log('First 5 numbers:', pageContent.recordingNumbers.slice(0, 5));
    } else {
      console.log('\n❌ NO RECORDING NUMBERS FOUND');
      console.log('Page snippet:', pageContent.pageSnippet);
    }
    
  } catch (error) {
    console.error('Error during test:', error);
  } finally {
    await browser.close();
    console.log('Test complete');
  }
}

testSearch();