'use strict'

const axios = require('axios')
const Voronoi = require('voronoi')
const topojson = require('topojson')
const turf = require('turf')
const turfintersect = require('@turf/intersect')
const turfextent = require('turf-extent')
const jsonfile = require('jsonfile')
const fs = require('fs')

const ufs = require('./ufs.js')
const Utils = require('./utils.js')


main()

async function main() {
	for (var i = 0; i < ufs.length; i++) {
		let uf = ufs[i].sigla
		let codIbge = ufs[i].codIbge
		try {
			await generateShapes(uf, codIbge)
		} catch (err) {
			console.log('Error in generateShapes()')
			console.error(err)
		}
	}
}

async function generateShapes(uf, codIbge) {
	var citiesBorders,
		coordenadas

	uf = uf.toUpperCase()
	console.log('Generating district shapes for ' + uf)
	console.log('Loading city shapes')
	citiesBorders = getCitiesBorders(uf)

	console.log('Loading coordinates from Atlas Eleitoral API')
	try {
		let response = await axios.get(getCoordenadasURL(uf))
		coordenadas = response.data
	} catch (err) {
		console.error('Error loading coordinates')
		console.error(err)
	}

	processCoordinates(uf, coordenadas, citiesBorders)
}

function getCitiesBorders(uf) {
	uf = uf.toUpperCase()
	var file = './municipal-brazilian-geodata/data/' + uf + '.json'
	return jsonfile.readFileSync(file)
}

function getCoordenadasURL(uf) {
	return 'http://atlas.jelasticlw.com.br/api/coordenadas?uf=' + uf.toUpperCase()
}

function processCoordinates(uf, coordenadas, borders) {
	let coordenadasPorMunicipio = Utils.groupBy(coordenadas, coord => Utils.normalizeNome(coord.municipio))
	let featureCollection = {
		"type": "FeatureCollection",
		"features": []
	}

	borders.features.forEach(feature => {
		let nome = feature.properties.NOME
		let codIbge = parseInt(feature.properties.GEOCODIGO)
		console.log('Drawing maps for ' + nome)
		nome = Utils.checkRenames(Utils.normalizeNome(nome), uf)
		let distritos = coordenadasPorMunicipio[nome]
		if (!distritos) {
			console.error(`Invalid city name: ${nome} (${uf}), geocode ${feature.properties.GEOCODIGO}`)
			process.exit()
		}
		if (distritos.length == 1) {
			// Temos que alterar feature.properties para 
			// conter o id do distrito e o nome do município
			let {
				id,
				municipio,
				zona
			} = distritos[0]
			let codTse = parseInt(id.split('-')[0])
			zona = parseInt(zona)
			feature.properties = {
				id,
				municipio,
				zona,
				codTse,
				codIbge
			}
			featureCollection.features.push(feature)
			return
		}

		// Will only execute the following code if the city
		// has multiple electoral zones
		
		let extent = turfextent(feature)
		let bbox = {
			xl: extent[1],
			yt: extent[0],
			xr: extent[3],
			yb: extent[2]
		}
		let sites = distritos.map(distrito => {
			let {
				id,
				municipio,
				zona,
				lat,
				long
			} = distrito
			let codTse = parseInt(id.split('-')[0])
			zona = parseInt(zona)
			return {
				id,
				municipio,
				zona,
				codTse,
				codIbge,
				x: parseFloat(lat),
				y: parseFloat(long)
			}
		})
		
        // Now we're going to eliminate duplicate coordinates, by
        // creating a small difference between them
        sites = sites.sort((a, b) => {
			if (a.x == b.x)
			    return a.y - b.y
            return a.x - b.x
		})
        for (var i=1; i<sites.length; i++) {
            // Yes, we start with i=1
            let thissite = sites[i]
            let previoussite = sites[i-1]
            if (thissite.x == previoussite.x && thissite.y == previoussite.y) {
                thissite.x += i * 0.00001
                thissite.y += i * 0.00001
            }
        }            

		var voronoi = new Voronoi()
		var diagram = voronoi.compute(sites, bbox)
		let cityFeatures = createGeoJSONFromVoronoiDiagram(diagram, feature)
		featureCollection.features = [...featureCollection.features, ...cityFeatures.features]
	})

	let topology = convertToTopology(featureCollection)
	saveShapefiles(featureCollection, topology, uf)
}

function createGeoJSONFromVoronoiDiagram(diagram, cityBorder) {
	var geo = {
		"type": "FeatureCollection",
		"features": []
	}

	function getFeatureForCell(index) {
		var properties = diagram.cells[index].site
		var feature = {
			"type": "Feature",
			"properties": {
				id: properties.id,
				municipio: properties.municipio,
				zona: properties.zona,
				codTse: properties.codTse,
				codIbge: properties.codIbge,
				index,
			},
			"geometry": {
				"type": "Polygon",
				"coordinates": []
			}
		}

		function convertPointToArray(point) {
			return [point.y, point.x]
		}

		if (!diagram.cells[index]) {
			return null
		}

		var cell = diagram.cells[index]
		var coords = []

		cell.halfedges.forEach((he, index) => {
			if (!index) {
				coords.push(convertPointToArray(he.getStartpoint()))
			}
			coords.push(convertPointToArray(he.getEndpoint()))
		})

		feature.geometry.coordinates.push(coords)
		return feature
	}

	let coordinates = cityBorder.geometry.coordinates[0]

	if (coordinates.length > 1) {
		coordinates = [coordinates]
	}

	let polygon = turf.polygon(coordinates)

	for (var i = 0; i < diagram.cells.length; i++) {
		let feature = getFeatureForCell(i)
		if (feature) {
			let adjustedfeature = turf.intersect(polygon, feature)
			if (adjustedfeature) {
				adjustedfeature.properties = feature.properties
				geo.features.push(adjustedfeature)
			}

		} else {
			console.log('indice ' + i + ' deu problema')
		}
	}

	return geo
}

function convertToTopology (geoJSON, simplifyWeight = 0.00001) {
	var topology = topojson.topology({
		municipios: geoJSON
	})
	var topologyAfterPresimplify = topojson.presimplify(topology);
	var topologySimplified = topojson.simplify(topologyAfterPresimplify, simplifyWeight);
	return topologySimplified
}


function saveShapefiles(geoJSON, topoJSON, uf) {
	var mapPath = './mapas'
	var geoJSONPath = mapPath + '/geoJSON'
	var topoJSONPath = mapPath + '/topoJSON'
	var geoJSONFile = geoJSONPath + '/shapefile-' + uf + '.json'
	var topoJSONFile = topoJSONPath + '/topojson-' + uf + '.json'

	try {
		fs.mkdirSync(mapPath)
	} catch (error) {}
	try {
		fs.mkdirSync(geoJSONPath)
	} catch (error) {}
	try {
		fs.mkdirSync(topoJSONPath)
	} catch (error) {}

	jsonfile.writeFileSync(geoJSONFile, geoJSON)
	jsonfile.writeFileSync(topoJSONFile, topoJSON)
}

