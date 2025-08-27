// Generate test liens for testing export functionality
const currentDate = new Date();
const liens = [];

for (let i = 0; i < 25; i++) {
  const daysAgo = Math.floor(Math.random() * 10);
  const recordDate = new Date(currentDate);
  recordDate.setDate(recordDate.getDate() - daysAgo);
  
  liens.push({
    recordingNumber: `2025-${String(100000 + i).padStart(6, '0')}`,
    recordDate: recordDate.toISOString(),
    debtorName: `${['John', 'Jane', 'Michael', 'Sarah', 'David'][i % 5]} ${['Smith', 'Johnson', 'Williams', 'Brown', 'Jones'][Math.floor(i / 5) % 5]}`,
    debtorAddress: `${1000 + i * 10} ${['Main', 'Oak', 'Elm', 'Pine', 'Maple'][i % 5]} Street, Phoenix, AZ 850${String(10 + (i % 40)).padStart(2, '0')}`,
    amount: String(Math.floor(Math.random() * 50000) + 5000),
    creditorName: `${['Phoenix', 'Valley', 'Desert', 'Sun City', 'Mesa'][i % 5]} Medical Center`,
    county: "Maricopa County",
    status: i % 3 === 0 ? "synced" : "pending",
    documentUrl: `https://recorder.maricopa.gov/docs/2025-${String(100000 + i).padStart(6, '0')}.pdf`,
    downloadedPdfPath: i % 4 === 0 ? `/pdfs/2025-${String(100000 + i).padStart(6, '0')}.pdf` : null,
    airtableRecordId: i % 3 === 0 ? `rec${String(i).padStart(10, '0')}` : null,
    enrichedData: null
  });
}

// Send each lien to the API
async function addLiens() {
  for (const lien of liens) {
    try {
      const response = await fetch('http://localhost:5000/api/liens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lien)
      });
      if (!response.ok) {
        console.error(`Failed to add lien ${lien.recordingNumber}`);
      }
    } catch (error) {
      console.error(`Error adding lien ${lien.recordingNumber}:`, error);
    }
  }
  console.log(`Added ${liens.length} test liens`);
}

addLiens();
