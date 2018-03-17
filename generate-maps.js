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
const brStates = require('./br-states.js')

var stateBorder


main()


async function main() {
	for (var i = 0; i < ufs.length; i++) {
		let uf = ufs[i].sigla
		let codIbge = ufs[i].codIbge
		try {
			await generateShapes(uf, codIbge)
		} catch (err) {
			console.log(err)
		}
	}
}

async function generateShapes(uf, codIbge) {
	var citiesBorders,
		coordenadas

	uf = uf.toUpperCase()
	console.log('Generating district shapes for ' + uf)
	console.log('Loading cities shapes')
	citiesBorders = getCitiesBorders(uf)

	console.log('Loading coordinates from Atlas Eleitoral API')
	try {
		let response = await axios.get(getCoordenadasURL(uf))
		coordenadas = response.data
	} catch (err) {
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
	let coordenadasPorMunicipio = groupBy(coordenadas, coord => normalizeNome(coord.municipio))
	let featureCollection = {
		"type": "FeatureCollection",
		"features": []
	}

	borders.features.forEach(feature => {
		let nome = feature.properties.NOME
		console.log('Processando município ' + nome)
		nome = checkRenames(normalizeNome(nome), uf)
		let distritos = coordenadasPorMunicipio[nome]
		if (!distritos) {
			console.error(`Invalid city name: ${nome} (${uf}), geocode ${feature.properties.GEOCODIGO}`)
			//console.log(feature.properties)
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
			zona = parseInt(zona)
			feature.properties = {
				id,
				municipio,
				zona
			}
			featureCollection.features.push(feature)
			return
		}

		let extent = turfextent(feature)
		console.log(extent)
		let bbox = {
			xl: extent[1],
			yt: extent[0],
			xr: extent[3],
			yb: extent[2]
		}
		let sites = distritos.map(distrito => {
			//console.log(distrito)
			let {
				id,
				municipio,
				zona,
				lat,
				long
			} = distrito
			zona = parseInt(zona)
			return {
				id,
				municipio,
				zona,
				x: parseFloat(lat),
				y: parseFloat(long)
			}
		})

		var voronoi = new Voronoi()
		var diagram = voronoi.compute(sites, bbox)
		//console.log(diagram)

		let cityFeatures = createGeoJSONFromVoronoiDiagram(diagram, feature)
		featureCollection.features = [...featureCollection.features, ...cityFeatures.features]
		//console.log(JSON.stringify(geoJSON))
	})

	saveShapefiles(featureCollection, uf)
}

// This textarea does not exist anymore
//document.getElementById('obj').value = JSON.stringify(geoJSON)

function createGeoJSONFromVoronoiDiagram(diagram, stateBorder) {
	var geo = {
		"type": "FeatureCollection",
		"features": []
	}

	function getFeatureForCell(index) {
		var feature = {
			"type": "Feature",
			"properties": {
				id: diagram.cells[index].site.id,
				municipio: diagram.cells[index].site.municipio,
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

	let timeStart = new Date()
	let coordinates = stateBorder.geometry.coordinates[0]

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

	let timeEnd = new Date()
	console.log(`Time elapsed: ${(timeEnd - timeStart)/1000} s`)
	return geo
}


function saveShapefiles(json, uf) {
	var mapPath = './mapas'
	var geoJSONPath = mapPath + '/geoJSON'
	var topoJSONPath = mapPath + '/topoJSON'
	var geoJSONFile = geoJSONPath + '/shapefile-' + uf + '.json'
	var topoJSONFile = topoJSONPath + '/topojson-' + uf + '.json'
	var simplifyWeight = 0.00001
	var topology = topojson.topology({
		municipios: json
	})
	var topologyAfterPresimplify = topojson.presimplify(topology);
	var topologySimplified = topojson.simplify(topologyAfterPresimplify, simplifyWeight);

	try {
		fs.mkdirSync(mapPath)
	} catch (error) {}
	try {
		fs.mkdirSync(geoJSONPath)
	} catch (error) {}
	try {
		fs.mkdirSync(topoJSONPath)
	} catch (error) {}

	jsonfile.writeFileSync(geoJSONFile, json)
	jsonfile.writeFileSync(topoJSONFile, topologySimplified)
}


function groupBy(arr, idFunc) {
	var obj = {}

	if (!idFunc) {
		idFunc = (item) => item.id
	}

	arr.forEach(item => {
		let id = idFunc(item)
		if (!obj[id]) {
			obj[id] = [item]
		} else {
			obj[id].push(item)
		}
	})

	return obj
}

function normalizeNome(str) {
	if (!str)
		return str
	return str.toUpperCase().
	replace('Á', 'A').
	replace('É', 'E').
	replace('Í', 'I').
	replace('Ó', 'O').
	replace('Ú', 'U').
	replace('À', 'A').
	replace('È', 'E').
	replace('Ê', 'E').
	replace('Ã', 'A').
	replace('À', 'A').
	replace('Õ', 'O').
	replace('Ô', 'O').
	replace('Ç', 'C').
	replace('Ñ', 'N')
}

function checkRenames(nome, uf) {
	var renames = [{
		old: 'GOVERNADOR LOMANTO JUNIOR',
		new: 'BARRO PRETO'
	}, {
		old: 'ITAPAGE',
		new: 'ITAPAJE'
	}, {
		old: 'SANTO ANTONUIO DO LESTE',
		new: 'SANTO ANTONIO DO LESTE'
	}, {
		old: 'BRASOPOLIS',
		new: 'BRAZOPOLIS'
	}, {
		old: 'ITABIRINHA DE MANTENA',
		new: 'ITABIRINHA'
	}, {
		old: 'ELDORADO DOS CARAJAS',
		new: 'ELDORADO DO CARAJAS'
	}, {
		old: 'SANTA ISABEL DO PARA',
		new: 'SANTA IZABEL DO PARA'
	}, {
		old: 'SANTAREM',
		new: 'JOCA CLAUDINO',
		uf: 'PB'
	}, {
		old: 'SAO DOMINGOS DE POMBAL',
		new: 'SAO DOMINGOS'
	}, {
		old: 'CAMPO DE SANTANA',
		new: 'TACIMA',
		uf: 'PB'
	}, {
		old: 'SERIDO',
		new: 'SAO VICENTE DO SERIDO',
		uf: 'PB'
	}, {
		old: 'VILA ALTA',
		new: 'ALTO PARAISO',
		uf: 'PR'
	}, {
		old: 'BELEM DE SAO FRANCISCO',
		new: 'BELEM DO SAO FRANCISCO',
		uf: 'PE'
	}, {
		old: 'IGUARACI',
		new: 'IGUARACY'
	}, {
		old: 'LAGOA DO ITAENGA',
		new: 'LAGOA DE ITAENGA'
	}, {
		old: 'PARATI',
		new: 'PARATY'
	}, {
		old: 'TRAJANO DE MORAIS',
		new: 'TRAJANO DE MORAES',
		uf: 'RJ'
	}, {
		old: 'PRESIDENTE JUSCELINO',
		new: 'SERRA CAIADA',
		uf: 'RN'
	}, {
		old: 'SAO MIGUEL DE TOUROS',
		new: 'SAO MIGUEL DO GOSTOSO',
		uf: 'RN'
	}, {
		old: 'SANTANA DO LIVRAMENTO',
		new: 'SANT\'ANA DO LIVRAMENTO',
		uf: 'RS'
	}, {
		old: 'PRESIDENTE CASTELO BRANCO',
		new: 'PRESIDENTE CASTELLO BRANCO',
		uf: 'SC'
	}, {
		old: 'PICARRAS',
		new: 'BALNEARIO PICARRAS',
		uf: 'SC'
	}, {
		old: 'MOJI-MIRIM',
		new: 'MOGI MIRIM'
	}, {
		old: 'EMBU',
		new: 'EMBU DAS ARTES',
		uf: 'SP'
	}, {
		old: 'MOJI DAS CRUZES',
		new: 'MOGI DAS CRUZES'
	}, {
		old: 'GRACHO CARDOSO',
		new: 'GRACCHO CARDOSO'
	}, {
		old: 'COUTO DE MAGALHAES',
		new: 'COUTO MAGALHAES',
		uf: 'TO'
	}, {
		old: 'SAO VALERIO DA NATIVIDADE',
		new: 'SAO VALERIO',
		uf: 'TO'
	}]
	for (var i = 0; i < renames.length; i++) {
		if (nome == renames[i].old) {
			if (renames[i].uf) {
				if (renames[i].uf != uf)
					continue
			}
			return renames[i].new
		}
	}
	return nome
}