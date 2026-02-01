const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const wellknown = require('wellknown');
const pako = require('pako');
const topojsonServer = require('topojson-server');
const topojsonSimplify = require('topojson-simplify');
const topojsonClient = require('topojson-client');

/**
 * Converts a CSV file with a WKT geometry column to a GeoJSON FeatureCollection.
 * 
 * @param {string} inputPath Path to the input CSV file (can be .csv or .csv.gz)
 * @param {string} outputPath Path to the output GeoJSON file
 * @param {string} geometryColumn Name of the column containing WKT geometry
 * @param {number} tolerance Simplification tolerance (e.g., 0.001)
 * @param {boolean} compress Whether to gzip the output
 */
function convertCsvToGeoJson(inputPath, outputPath, geometryColumn = 'geom_wkt', tolerance = 0, compress = false) {
    console.log(`Reading ${inputPath}...`);
    let csvData;
    const fileBuffer = fs.readFileSync(inputPath);

    if (inputPath.endsWith('.gz')) {
        csvData = pako.ungzip(fileBuffer, { to: 'string' });
    } else {
        csvData = fileBuffer.toString('utf8');
    }

    console.log('Parsing CSV...');
    Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: function(results) {
            console.log(`Parsed ${results.data.length} rows.`);
            
            const features = results.data
                .filter(row => row[geometryColumn])
                .map(row => {
                    try {
                        const geometry = wellknown.parse(row[geometryColumn]);
                        // Remove the geometry column from properties to avoid redundancy
                        const properties = { ...row };
                        delete properties[geometryColumn];
                        
                        return {
                            type: 'Feature',
                            properties: properties,
                            geometry: geometry
                        };
                    } catch (e) {
                        console.warn(`Failed to parse geometry for row:`, row);
                        return null;
                    }
                })
                .filter(f => f !== null);

            let featureCollection = {
                type: 'FeatureCollection',
                features: features
            };

            if (tolerance > 0) {
                console.log(`Simplifying geometry with tolerance ${tolerance} (topological)...`);
                // Convert to TopoJSON to preserve topology
                const topo = topojsonServer.topology({ collection: featureCollection });
                // Pre-quantize for better results if needed, or just simplify
                const simplifiedTopo = topojsonSimplify.simplify(topojsonSimplify.presimplify(topo), tolerance);
                // Convert back to GeoJSON
                featureCollection = topojsonClient.feature(simplifiedTopo, simplifiedTopo.objects.collection);
            }

            console.log(`Converted ${features.length} features to GeoJSON.`);
            const jsonString = JSON.stringify(featureCollection);
            
            if (compress || outputPath.endsWith('.gz')) {
                console.log('Compressing output...');
                const gzipped = pako.gzip(jsonString);
                fs.writeFileSync(outputPath, gzipped);
            } else {
                fs.writeFileSync(outputPath, JSON.stringify(featureCollection, null, 2));
            }
            console.log(`Saved to ${outputPath}`);
        },
        error: function(err) {
            console.error('Error parsing CSV:', err);
        }
    });
}

// Usage: node convert_to_geojson.js <input_csv> <output_geojson> [geometry_column] [tolerance]
const args = process.argv.slice(2);
if (args.length < 2) {
    console.log('Usage: node convert_to_geojson.js <input_csv> <output_geojson> [geometry_column] [tolerance]');
    process.exit(1);
}

const [input, output, geomCol, tolerance] = args;
convertCsvToGeoJson(input, output, geomCol || 'geom_wkt', parseFloat(tolerance) || 0);
