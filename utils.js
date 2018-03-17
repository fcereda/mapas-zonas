'use strict'

var Utils = {

    groupBy(arr, idFunc) {
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
    },

    normalizeNome(str) {
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
    },

    checkRenames(nome, uf) {
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
                if (renames[i].uf && renames[i].uf != uf) {
                    continue
                }
                return renames[i].new
            }
        }
        return nome
    }

}

module.exports = Utils