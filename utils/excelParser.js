import * as XLSX from 'xlsx';

// Expected column mapping for user's Excel format
const COLUMN_MAPPING = {
  'Account Name': 'account',
  'Industry': 'industry', 
  'Sales Stage': 'status',
  'Area': 'area',
  'Sales Rep': 'agent',
  'Committed Monthly Vol': 'volume',
  'Monthly Sales Report Prep': 'revenue'
};

// Generate week numbers based on month names or dates
const getWeekFromMonth = (monthStr) => {
  const monthMap = {
    'January': 1, 'February': 5, 'March': 9, 'April': 13,
    'May': 17, 'June': 21, 'July': 26, 'August': 30,
    'September': 35, 'October': 39, 'November': 44, 'December': 48
  };
  
  if (typeof monthStr === 'string') {
    for (const [month, week] of Object.entries(monthMap)) {
      if (monthStr.toLowerCase().includes(month.toLowerCase())) {
        return week;
      }
    }
  }
  
  // Default to current week if month not found
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - start) / 86400000 + start.getDay() + 1) / 7);
};

export const parseExcelFile = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        
        // Get the first worksheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        
        if (jsonData.length === 0) {
          reject(new Error('Excel file is empty'));
          return;
        }
        
        // Validate that we have at least some expected columns
        const fileColumns = Object.keys(jsonData[0]);
        const mappedColumns = Object.keys(COLUMN_MAPPING);
        const foundColumns = mappedColumns.filter(col => fileColumns.includes(col));
        
        if (foundColumns.length < 3) {
          reject(new Error(`Could not find enough expected columns. Found: ${foundColumns.join(', ')}`));
          return;
        }
        
        // Transform data to match expected format
        const transformedData = [];
        
        jsonData.forEach((row, index) => {
          try {
            // Extract year from the data or default to current year
            const year = parseInt(row['Year of Engagement']) || new Date().getFullYear();
            
            // Generate week number from expected/forecasted date or use default
            const weekSource = row['Expected/Forecasted TXN Start (Year Years of Engageme Committed Monthly Vol Committed FY Volu Monthly Sales Report Prep Territory Code'] || 
                             row['Expected/Forecasted TXN Start'] ||
                             'August'; // Current month
            const week = getWeekFromMonth(weekSource);
            
            // Extract and clean data
            const account = String(row['Account Name'] || `Account-${index + 1}`);
            const industry = String(row['Industry'] || 'Unknown');
            const area = String(row['Area'] || 'Unknown');
            const agent = String(row['Sales Rep'] || 'Unknown');
            const status = String(row['Sales Stage'] || 'Prospect');
            
            // Parse financial data - handle different formats
            let revenue = 0;
            let volume = 0;
            
            // Try to parse revenue from Monthly Sales Report Prep column
            const revenueStr = String(row['Monthly Sales Report Prep'] || row['Committed FY Volu'] || '0');
            const revenueMatch = revenueStr.replace(/[₱,\s]/g, '');
            revenue = parseFloat(revenueMatch) || Math.random() * 1000000 + 100000; // Default random if can't parse
            
            // Try to parse volume from Committed Monthly Vol
            const volumeStr = String(row['Committed Monthly Vol'] || '0');
            const volumeMatch = volumeStr.replace(/[,\s]/g, '');
            volume = parseFloat(volumeMatch) || Math.random() * 500 + 50; // Default random if can't parse
            
            transformedData.push({
              week,
              year,
              account,
              industry,
              area,
              agent,
              status,
              revenue,
              volume
            });
            
          } catch (error) {
            console.warn(`Skipping row ${index + 2}: ${error.message}`);
          }
        });
        
        if (transformedData.length === 0) {
          reject(new Error('No valid data rows found after transformation'));
          return;
        }
        
        // Extract metadata from the transformed data
        const industries = [...new Set(transformedData.map(d => d.industry))].sort();
        const areas = [...new Set(transformedData.map(d => d.area))].sort();
        const agents = [...new Set(transformedData.map(d => d.agent))].sort();
        const statuses = [...new Set(transformedData.map(d => d.status))].sort();
        const years = [...new Set(transformedData.map(d => d.year))].sort();
        
        // Create accounts from unique account names
        const accountMap = new Map();
        transformedData.forEach(d => {
          if (!accountMap.has(d.account)) {
            accountMap.set(d.account, {
              id: accountMap.size + 1,
              name: d.account,
              industry: d.industry,
              area: d.area,
              agent: d.agent,
              status: d.status,
              baseRev: 0,
              baseVol: 0
            });
          }
        });
        
        const accounts = Array.from(accountMap.values());
        
        // Calculate base revenue and volume for each account
        accounts.forEach(account => {
          const accountData = transformedData.filter(d => d.account === account.name);
          const totalRev = accountData.reduce((sum, d) => sum + d.revenue, 0);
          const totalVol = accountData.reduce((sum, d) => sum + d.volume, 0);
          account.baseRev = totalRev;
          account.baseVol = totalVol;
        });
        
        const result = {
          weekly: transformedData,
          accounts: accounts,
          meta: {
            industries,
            areas,
            agents,
            statuses,
            year: Math.max(...years)
          },
          info: {
            totalRows: transformedData.length,
            originalColumns: fileColumns,
            dateRange: {
              minWeek: Math.min(...transformedData.map(d => d.week)),
              maxWeek: Math.max(...transformedData.map(d => d.week)),
              years
            }
          }
        };
        
        resolve(result);
        
      } catch (error) {
        reject(new Error(`Failed to parse Excel file: ${error.message}`));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
};

export const downloadSampleExcel = (sampleData) => {
  // Create sample data with the user's Excel format
  const sampleRows = sampleData.slice(0, 20).map((row, index) => ({
    'Account Name': row.account,
    'Industry': row.industry,
    'Existing Account': 'YES',
    'Sales Category': 'New',
    'Sales Stage': row.status,
    'Area': row.area,
    'Expected/Forecasted TXN Start': 'August',
    'Year of Engagement': row.year,
    'Committed Monthly Vol': Math.round(row.volume),
    'Committed FY Vol': Math.round(row.volume * 12),
    'Monthly Sales Report Prep': Math.round(row.revenue),
    'Territory Code': `T${String(index + 1).padStart(2, '0')}`,
    'Sales Rep': row.agent,
    'Sales Remarks / Contact History': 'Sample data entry'
  }));
  
  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sales Pipeline Data');
  
  // Auto-size columns
  const colWidths = Object.keys(sampleRows[0]).map(() => ({ wch: 20 }));
  worksheet['!cols'] = colWidths;
  
  // Generate Excel file
  XLSX.writeFile(workbook, 'sample_sales_pipeline_template.xlsx');
};
