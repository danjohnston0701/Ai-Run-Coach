import pg from 'pg';

async function reprocess() {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  const dbUrl = process.env.EXTERNAL_DATABASE_URL || process.env.DATABASE_URL;
  
  if (!apiKey) {
    console.error('GOOGLE_MAPS_API_KEY not set');
    process.exit(1);
  }
  
  const { Client } = pg;
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  
  const res = await client.query('SELECT id, start_lat, start_lng FROM routes');
  console.log(`Found ${res.rows.length} routes to process`);
  
  for (const route of res.rows) {
    if (!route.start_lat || !route.start_lng) continue;
    
    try {
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${route.start_lat},${route.start_lng}&key=${apiKey}`;
      const geocodeRes = await fetch(geocodeUrl);
      const geocodeData = await geocodeRes.json() as any;
      
      let label = 'Unknown Location';
      if (geocodeData.results && geocodeData.results.length > 0) {
        const components = geocodeData.results[0].address_components;
        const streetNumber = components?.find((c: any) => c.types.includes('street_number'))?.long_name;
        const streetRoute = components?.find((c: any) => c.types.includes('route'))?.long_name;
        const locality = components?.find((c: any) => c.types.includes('locality'))?.long_name;
        const sublocality = components?.find((c: any) => c.types.includes('sublocality'))?.long_name;
        
        const streetPart = streetNumber && streetRoute ? `${streetNumber} ${streetRoute}` : streetRoute || '';
        const cityPart = locality || sublocality || '';
        
        if (streetPart && cityPart) {
          label = `${streetPart}, ${cityPart}`;
        } else if (streetPart) {
          label = streetPart;
        } else if (cityPart) {
          label = cityPart;
        } else {
          label = geocodeData.results[0].formatted_address?.split(',').slice(0, 2).join(',') || 'Unknown Location';
        }
      }
      
      await client.query('UPDATE routes SET start_location_label = $1 WHERE id = $2', [label, route.id]);
      console.log(`Updated ${route.id}: ${label}`);
      
      await new Promise(r => setTimeout(r, 100));
    } catch (err: any) {
      console.error(`Failed for ${route.id}:`, err.message);
    }
  }
  
  await client.end();
  console.log('Done!');
}

reprocess().catch(console.error);
