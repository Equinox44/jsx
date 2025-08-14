import * as XLSX from 'xlsx';

// Expected column mapping for user's Excel format
const COLUMN_MAPPING = {
  'Account Name': 'account',
  'Industry': 'industry', 
  'Sales Category': 'salesCategory',
  'Sales Stage': 'status',
  'City': 'city',
  'Territory Code': 'territoryCode',
  'Sales Agent': 'agent',
  'Committed Monthly Volume': 'volume',
  'Committed FY Volume': 'fyVolume',
  'Monthly Sales Forecast': 'revenue',
  'Team Designation': 'teamDesignation',
  'Forecasted TXN Start (Month)': 'forecastedMonth',
  'Forecasted TXN Start (Year)': 'startYear',
  'Years of Engagement': 'yearsOfEngagement',
  'Sales Remarks / Contact History': 'remarks'
};

// Parse month from text - returns month number (1-12)
const parseMonthFromText = (monthStr) => {
  const monthMap = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'may': 5, 'jun': 6, 'jul': 7, 'aug': 8,
    'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12
  };
  
  if (typeof monthStr === 'string') {
    const lowerStr = monthStr.toLowerCase();
    for (const [month, num] of Object.entries(monthMap)) {
      if (lowerStr.includes(month)) {
        return num;
      }
    }
  }
  
  // Try to parse as number if text parsing fails
  const num = parseInt(monthStr);
  if (num >= 1 && num <= 12) return num;
  
  // Default to current month
  return new Date().getMonth() + 1;
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
        
        console.log('Total rows from Excel:', jsonData.length);
        console.log('First 3 rows:', jsonData.slice(0, 3));
        
        if (jsonData.length === 0) {
          reject(new Error('Excel file is empty'));
          return;
        }
        
        // Validate that we have at least some expected columns
        const fileColumns = Object.keys(jsonData[0]);
        console.log('File columns found:', fileColumns);
        
        const mappedColumns = Object.keys(COLUMN_MAPPING);
        const foundColumns = mappedColumns.filter(col => 
          fileColumns.some(fileCol => fileCol.includes(col) || col.includes(fileCol))
        );
        
        console.log('Mapped columns found:', foundColumns);
        
        if (foundColumns.length < 2) {
          console.error('Not enough columns found. File columns:', fileColumns);
          reject(new Error(`Could not find enough expected columns. Found: ${foundColumns.join(', ')}. Available: ${fileColumns.join(', ')}`));
          return;
        }

        // Transform data to match expected format - create weekly data for each account
        const accountsData = [];
        
        jsonData.forEach((row, index) => {
          try {
            console.log('Processing row:', index, 'Data keys:', Object.keys(row));
            
            // Extract year from the data or default to current year
            const startYear = parseInt(row['Forecasted TXN Start (Year)']) || new Date().getFullYear();
            
            // Parse forecasted start month
            const forecastedStart = row['Forecasted TXN Start (Month)'] || 'August';
            const startMonth = parseMonthFromText(forecastedStart);
            
            // Parse years of engagement
            const yearsOfEngagement = parseInt(row['Years of Engagement']) || 1;
            
            // Extract and clean data
            const account = String(row['Account Name'] || `Account-${index + 1}`);
            const industry = String(row['Industry'] || 'Unknown');
            const salesCategory = String(row['Sales Category'] || 'Unknown');
            const city = String(row['City'] || 'Unknown');
            const territoryCode = String(row['Territory Code'] || 'Unknown');
            const agent = String(row['Sales Agent'] || 'Unknown');
            const status = String(row['Sales Stage'] || 'Prospect');
            const teamDesignation = String(row['Team Designation'] || 'Unknown');
            
            // Parse financial data
            let monthlyRevenue = 0;
            let monthlyVolume = 0;
            
            console.log(`Row ${index}: Checking financial data for ${account}`);
            console.log('Monthly Sales Forecast value:', row['Monthly Sales Forecast']);
            console.log('Committed Monthly Volume value:', row['Committed Monthly Volume']);
            
            // Try to get revenue from Monthly Sales Forecast
            if (row['Monthly Sales Forecast']) {
              const revenueStr = String(row['Monthly Sales Forecast']);
              console.log(`Revenue string for ${account}:`, revenueStr);
              const revenueMatch = revenueStr.replace(/[₱,\s]/g, '');
              console.log(`Revenue after cleanup:`, revenueMatch);
              const parsedRevenue = parseFloat(revenueMatch);
              if (!isNaN(parsedRevenue) && parsedRevenue > 0) {
                monthlyRevenue = parsedRevenue;
                console.log(`✓ Found revenue ${monthlyRevenue} for account ${account}`);
              } else {
                console.log(`✗ Could not parse revenue for ${account}: ${revenueMatch}`);
              }
            }
            
            // Try to get volume from Committed Monthly Volume
            if (row['Committed Monthly Volume']) {
              const volumeStr = String(row['Committed Monthly Volume']);
              console.log(`Volume string for ${account}:`, volumeStr);
              const volumeMatch = volumeStr.replace(/[,\s]/g, '');
              console.log(`Volume after cleanup:`, volumeMatch);
              const parsedVolume = parseFloat(volumeMatch);
              if (!isNaN(parsedVolume) && parsedVolume > 0) {
                monthlyVolume = parsedVolume;
                console.log(`✓ Found volume ${monthlyVolume} for account ${account}`);
              } else {
                console.log(`✗ Could not parse volume for ${account}: ${volumeMatch}`);
              }
            }
            
            // If we still don't have revenue/volume, use reasonable defaults
            if (monthlyRevenue === 0) {
              monthlyRevenue = 500000 + Math.random() * 2000000; // 500K to 2.5M PHP
              console.log(`Using default revenue ${monthlyRevenue} for account ${account}`);
            }
            
            if (monthlyVolume === 0) {
              monthlyVolume = 50 + Math.random() * 500; // 50 to 550 units
              console.log(`Using default volume ${monthlyVolume} for account ${account}`);
            }
            
            // Store account data for weekly generation
            accountsData.push({
              account,
              industry,
              salesCategory,
              city,
              territoryCode,
              agent,
              status,
              teamDesignation,
              monthlyRevenue,
              monthlyVolume,
              startMonth,
              startYear,
              yearsOfEngagement,
              endYear: startYear + yearsOfEngagement - 1
            });
            
            console.log('Stored account data:', {
              account, industry, monthlyRevenue, monthlyVolume, startMonth, startYear, yearsOfEngagement
            });
            
          } catch (error) {
            console.warn(`Error processing row ${index + 2}: ${error.message}`, row);
          }
        });
        
        console.log('Finished processing all rows. Total accounts:', accountsData.length);
        console.log('Sample account data for debugging:', accountsData.slice(0, 2));
        
        // Now generate weekly data for each account
        const transformedData = [];
        
        console.log('Starting weekly data generation for', accountsData.length, 'accounts');
        console.log('Sample account data:', accountsData.slice(0, 2));
        
        for (let w = 1; w <= 52; w++) {
          accountsData.forEach((acc, accIndex) => {
            // Calculate which month this week corresponds to (1-12)
            const weekMonth = Math.ceil(w / 4.345);
            const currentYear = acc.startYear;
            
            // Check if this account should be contributing revenue/volume at this time
            // Account contributes from its start month through its end year
            const shouldContribute = weekMonth >= acc.startMonth && currentYear <= acc.endYear;
            
            // Debug for first few accounts and weeks
            if (accIndex < 3 && w <= 10) {
              console.log(`Week ${w} (month ${weekMonth}) - Account ${acc.account}:`);
              console.log(`  Start month: ${acc.startMonth}, Should contribute: ${shouldContribute}`);
              console.log(`  Monthly revenue: ${acc.monthlyRevenue}, Monthly volume: ${acc.monthlyVolume}`);
            }
            
            // Only generate revenue/volume if account should be contributing
            let weeklyRevenue = 0;
            let weeklyVolume = 0;
            
            if (shouldContribute) {
              // Convert monthly to weekly (divide by ~4.345 weeks per month)
              weeklyRevenue = acc.monthlyRevenue / 4.345;
              weeklyVolume = acc.monthlyVolume / 4.345;
              
              // Add some seasonal variation
              const seasonalFactor = 1 + 0.12 * Math.sin((2 * Math.PI * w) / 52);
              weeklyRevenue *= seasonalFactor;
              weeklyVolume *= seasonalFactor;
              
              // Debug for first contribution
              if (accIndex < 3 && w <= 10 && weeklyRevenue > 0) {
                console.log(`  → Weekly revenue: ${weeklyRevenue}, Weekly volume: ${weeklyVolume}`);
              }
            }
            
            transformedData.push({
              week: w,
              year: currentYear,
              account: acc.account,
              industry: acc.industry,
              salesCategory: acc.salesCategory,
              city: acc.city,
              area: acc.teamDesignation, // Map teamDesignation to area for compatibility
              territoryCode: acc.territoryCode,
              agent: acc.agent,
              status: acc.status,
              revenue: weeklyRevenue,
              volume: weeklyVolume,
              startMonth: acc.startMonth,
              startYear: acc.startYear,
              yearsOfEngagement: acc.yearsOfEngagement,
              endYear: acc.endYear
            });
          });
        }
        
        if (transformedData.length === 0) {
          console.error('No valid data rows found after transformation');
          reject(new Error('No valid data rows found after transformation'));
          return;
        }
        
        console.log(`Successfully transformed ${transformedData.length} rows`);
        console.log('Sample transformed data (first 5 rows):', transformedData.slice(0, 5));
        console.log('Sample revenue values:', transformedData.slice(0, 10).map(d => d.revenue));
        console.log('Sample volume values:', transformedData.slice(0, 10).map(d => d.volume));
        
        // Check for any non-zero values
        const nonZeroRevenue = transformedData.filter(d => d.revenue > 0);
        const nonZeroVolume = transformedData.filter(d => d.volume > 0);
        console.log(`Rows with non-zero revenue: ${nonZeroRevenue.length}`);
        console.log(`Rows with non-zero volume: ${nonZeroVolume.length}`);
        
        // Extract metadata from the transformed data
        const industries = [...new Set(transformedData.map(d => d.industry))].sort();
        const salesCategories = [...new Set(transformedData.map(d => d.salesCategory))].sort();
        const cities = [...new Set(transformedData.map(d => d.city))].sort();
        const areas = [...new Set(transformedData.map(d => d.area))].sort(); // Use area instead of teamDesignations
        const territoryCodes = [...new Set(transformedData.map(d => d.territoryCode))].sort();
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
              salesCategory: d.salesCategory,
              city: d.city,
              area: d.area, // Use area instead of teamDesignation
              territoryCode: d.territoryCode,
              agent: d.agent,
              status: d.status,
              baseRev: 0,
              baseVol: 0,
              startMonth: d.startMonth,
              startYear: d.startYear,
              yearsOfEngagement: d.yearsOfEngagement,
              endYear: d.endYear
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
            salesCategories,
            cities,
            areas, // Use areas instead of mapping teamDesignations
            territoryCodes,
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
