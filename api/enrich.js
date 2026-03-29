module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  var companies = req.body.companies;

  if (!companies || !Array.isArray(companies) || !companies.length) {
    return res.status(400).json({ error: 'Missing companies array' });
  }

  var apiKey = process.env.PDL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'PDL_API_KEY not configured' });

  var results = [];

  for (var i = 0; i < companies.length; i += 5) {
    var batch = companies.slice(i, i + 5);

    var promises = batch.map(function(company) {
      var params = new URLSearchParams({
        name: company.name,
        api_key: apiKey
      });
      if (company.country) {
        params.append('location', company.country);
      }

      return fetch(
        'https://api.peopledatalabs.com/v5/company/enrich?' + params.toString(),
        { method: 'GET', headers: { 'Accept': 'application/json' } }
      )
      .then(function(response) {
        if (response.status === 200) {
          return response.json().then(function(data) {
            return {
              name: company.name,
              matched: true,
              employee_count: data.employee_count || null,
              employee_range: data.size || null,
              industry: data.industry || null,
              revenue_range: data.inferred_revenue || null,
              founded: data.founded || null,
              linkedin_url: data.linkedin_url || null,
              tags: data.tags || []
            };
          });
        } else {
          return { name: company.name, matched: false };
        }
      })
      .catch(function() {
        return { name: company.name, matched: false };
      });
    });

    var batchResults = await Promise.all(promises);
    for (var j = 0; j < batchResults.length; j++) {
      results.push(batchResults[j]);
    }

    if (i + 5 < companies.length) {
      await new Promise(function(r) { setTimeout(r, 200); });
    }
  }

  return res.status(200).json({ results: results });
};
