// Ad-hoc probe: ViaCEP reverse search (logradouro -> CEPs) for SJC streets.
// Measures whether the bairros returned for a street span >1 official region.
// Region index mirrors BAIRROS_POR_REGIAO + BAIRROS_EXTRA from region-resolver.ts.

const BAIRROS_POR_REGIAO = {
  Centro: ["Banhado","Bairro dos Pinheiros","Centro","Chácara dos Eucaliptos","Conj. Hab. Vale dos Pinheiros","Conj. Res. Monte Castelo","Favela Vila Nova Esperança","Jardim Aparecida","Jardim Apolo I","Jardim Apolo II","Jardim Augusta","Jardim Azevedo","Jardim Bandeirantes","Jardim Bela Vista","Jardim Corinthians","Jardim Esplanada","Jardim Esplanada II","Jardim Frei Leopoldo","Jardim Jussara","Jardim Margareth","Jardim Maringá","Jardim Matarazzo","Jardim Nossa Senhora de Fátima","Jardim Nova América","Jardim Nova Europa","Jardim Oswaldo Cruz","Jardim Paulista","Jardim Renata","Jardim Santa Madalena","Jardim Santos Dumont","Jardim São Dimas","Jardim São José","Jardim Topázio","Jardim Vale Paraíso","Monte Castelo","Res. Esplanada do Sol","Res. Martins Pereira","Vila Abel","Vila Ady'Ana","Vila Adyana","Vila Betânia","Vila Cardoso","Vila Ema","Vila Guaianazes","Vila Guarani","Vila Higienópolis","Vila Icaraí","Vila Igualdade","Vila Ipiranga","Vila Jaci","Vila Kennedy","Vila Luzia","Vila Maria","Vila Mascarenhas Ferraz","Vila Nova Conceição","Vila Nova São José","Vila Nove de Julho","Vila Paganini","Vila Paulo Setúbal","Vila Piratininga","Vila Progresso","Vila Rubi","Vila Sanches","Vila Santa Cruz I","Vila Santa Cruz II","Vila Santa Cruz III","Vila Santa Helena","Vila Santa Luzia","Vila Santa Rita","Vila Santos","Vila São Paulo","Vila São Pedro","Vila Terezinha"],
  Norte: ["Águas do Canindu","Altos da Vila Paiva","Alto da Ponte","Bairro dos Ferreiras","Buquirinha","Caête","Colinas do Parahyba","Conj. Hab. Nova Cristina","Conj. Hab. São Geraldo","Conj. Res. Nova Cristina","Espelho d'Água","Favela Vila Rhodia","Fazenda Jataí","Hawai","Jaguariuna","Jardim Altos de Santana","Jardim Boa Vista","Jardim Guimarães","Jardim Jaci","Jardim Maritéia","Jardim Nova Paulicéia","Jardim Ouro Preto","Miranda","Oliveiras","Recanto Caetê","Rhodia","Santana","São Francisco Xavier","São Sebastião","Vargem Grande","Vila Alexandrina","Vila Cândida","Vila César","Vila Chiquinha","Vila Cristina","Vila do Carmo","Vila do Pena","Vila Esmeralda","Vila Leila","Vila Leila II","Vila Leonídia","Vila Machado","Vila Monte Alegre","Vila Nair","Vila Nossa Senhora das Graças","Vila Paiva","Vila Pasto Alto","Vila Rangel","Vila Rossi","Vila São Geraldo","Vila Santarém","Vila Simone","Vila Sinhá","Vila Unidos","Vila Veneziani","Vila Zizinha","Jardim Telespark","Jardim Minas Gerais"],
  Sul: ["Bosque dos Eucaliptos","Bosque dos Ipês","Campo dos Alemães","Capitingal","Caramujo","Chácaras Reunidas","Cidade Morumbi","Conj. Hab. Dom Pedro I","Conj. Hab. Dom Pedro II","Conj. Hab. Elmano F. Veloso","Conj. Res. 31 de Março","Conj. Res. Cidade Jardim","Conj. Res. Jardim das Flores","Conj. Res. Morada do Sol","Conj. Res. Morumbi","Conj. Res. Papa João Paulo II","Conj. Res. Primavera","Conj. Res. Recanto dos Eucaliptos","Conj. Res. Recanto dos Pinheiros","Conj. Res. Sol Nascente","Floradas de São José","Jardim América","Jardim Anhembi","Jardim Aeroporto","Jardim Colonial","Jardim Cruzeiro do Sul","Jardim das Azaléias","Jardim del Rey","Jardim do Céu","Jardim dos Bandeirantes","Jardim Estoril","Jardim Imperial","Jardim Juliana","Jardim Madureira","Jardim Mesquita","Jardim Nova República","Jardim Oriental","Jardim Oriente","Jardim Paraíso","Jardim Petrópolis","Jardim Portugal","Jardim República","Jardim Rosário","Jardim Satélite","Jardim Sul","Jardim Terras do Sul","Jardim Vale do Sol","Jardim Veneza","Palmeiras de São José","Parque dos Ipês","Parque Independência","Parque Industrial","Parque Interlagos","Parque Residencial União","Pernambucana de Baixo","Pinheirinho","Projeto Torrão de Ouro","Quinta das Flores","Res. Altos do Bosque","Res. De Ville","Res. Gazzo","Res. Jardins","Res. San Marino","Rio Comprido","Terrinha","Torrão de Ouro I","Torrão de Ouro II","Vila das Acácias","Vila das Flores","Vila Letônia","Vila Luchetti","Vila São Bento","Xingu","Jardim Morumbi","Jardim Primavera"],
  Leste: ["Águas da Prata","Araújo","Bairrinho","Bairro Cajurú","Bica d'Água","Bom Retiro","Cambucá","Campos de São José","Capão Grosso","Capão Grosso II","Castanheira II","Chácara Boa Esperança","Chácara Capão Grosso","Chácara Majestic","Chácara Pousada do Vale","Chácara Santa Luzia","Chácara São Vicente","Chácara Sítio Jataí","Cidade Vista Verde","Condomínio Floresta","Conj. Hab. Intervale","Conj. Hab. São José","Conj. Hab. Vila Tatetuba","Conj. Integração","Conj. Res. JK","Conj. Res. Parque das Américas","Conj. Res. Planalto","Ebenezer","Eugênio de Melo","Fazenda Bom Retiro","Fazenda Honda","Fazenda Nossa Senhora da Conceição","Fazenda Pilão Arcado","Fazenda Taira","Fazenda Takanashi","Fazenda Toninho Ferreira","Fazenda Vila Franca","Frei Galvão","Jardim Americano","Jardim Brasília","Jardim Castanheiras","Jardim Cerejeiras","Jardim Copacabana","Jardim Coqueiro","Jardim Diamante","Jardim Helena","Jardim Ipê","Jardim Ismênia","Jardim Itapuã","Jardim Maracanã","Jardim Mariana","Jardim Mariana II","Jardim Motorama","Jardim Nova Detroit","Jardim Nova Flórida","Jardim Nova Michigan","Jardim Olímpia","Jardim Paraíso do Sol","Jardim Pararangaba","Jardim San Rafael","Jardim Santa Inês I","Jardim Santa Inês II","Jardim Santa Inês III","Jardim Santa Lúcia","Jardim Santa Maria","Jardim São Jorge","Jardim São Vicente","Jardim Três José","Jardim Universo","Jardim Valparaíba","Mantiqueira I","Mantiqueira II","Maravilhas do Cajuru","Martins Guimarães","Mato Dentro","Mirante I","Mirante II","Morada do Fênix","Morada do Sol","Nossa Senhora do Bom Retiro","Nova Michigan II","Nova Michigan III","Nova Michigan IV","Parque Nova Esperança","Parque Novo Horizonte","Portal do Céu","Pousada do Vale","Primavera I","Primavera II","Recanto do Vale","Recanto dos Lagos","Renascer I","Renascer II","Res. Ana Maria","Res. Armando Moreira Righi","Res. da Ribeira","Res. Dom Bosco","Res. Galo Branco","Res. Vista Linda","Ressaca","Santa Cecília I","Santa Cecília II","Santa Helena","Santa Hermínia","Santa Maria I","Santa Rita","Serrote","Sítio Encantado","Terra Nova","Vilaggio d'Antonini","Vila Ester","Vila Industrial","Vila Matilde","Vila Monterrey","Vila Patrícia","Vila Tatetuba","Vila Tesouro","Jardim das Paineiras II","Setville Altos de São José","Setville"],
  Oeste: ["Beira Rio","Bosque Imperial","Jardim Altos do Esplanada","Jardim Alvorada","Jardim das Colinas","Jardim das Indústrias","Jardim Pôr do Sol","Limoeiro","Parque Residencial Aquarius","Residencial Jardim Aquarius","Res. Sunset Park","Royal Park","Urbanova"],
  Sudeste: ["Altos do Uirá","Chácaras São José","Conj. Hab. Polícia Militar","Conj. Res. Nosso Teto","Conj. São Judas Tadeu","DCTA","Jardim Colorado","Jardim da Granja","Jardim do Lago","Jardim Santa Fé","Jardim Santa Julia","Jardim Santa Luzia","Jardim São Judas Tadeu","Jardim São Leopoldo","Jardim Souto","Jardim Uirá","Parque Martim Cererê","Parque Santa Rita","Parque Santos Dumont","Pernambucana de Cima","Putim","Recanto das Jabuticabeiras","Recanto dos Eucaliptos","Recanto dos Nobres","Res. Bell Park","Res. Cambuí","Res. Flamboyant","Res. Jatobá","Res. Juritis","Res. Santa Rosa","Res. São Francisco","Sítio Bom Jesus","Terra Brasilis","Vila Adriana I","Vila Adriana II","Vila Iracema","Vila Rica","Vila São Benedito"],
};

const ABBREV = { jd:"jardim",jrd:"jardim",jdm:"jardim",jardin:"jardim",vl:"vila",villa:"vila",pq:"parque",res:"residencial",resid:"residencial",cj:"conjunto",conj:"conjunto",hab:"habitacional",cond:"condominio",chac:"chacara",faz:"fazenda",fzd:"fazenda",pres:"presidente",sta:"santa",sto:"santo",pe:"padre",dr:"doutor",eng:"engenheiro",soa:"sao" };
function norm(v){return String(v??"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[.,;:/\\]/g," ").replace(/\s+/g," ").trim();}
function key(v){return norm(v).split(" ").map(t=>ABBREV[t]??t).join(" ");}

const INDEX = new Map();
for(const [r,arr] of Object.entries(BAIRROS_POR_REGIAO)) for(const b of arr) INDEX.set(key(b), r);

// core-key fallback (strip generic prefix / trailing numeral) to catch e.g. "Jardim Esplanada II"
const STRIP = new Set(["vila","jardim","parque","residencial","conjunto","condominio","loteamento","bosque","chacara","chacaras","favela","cidade","projeto","sitio","habitacional","recanto","fazenda"]);
function coreKey(n){let t=n.split(" ").filter(Boolean);while(t.length>1&&STRIP.has(t[0]))t.shift();const isNum=x=>/^[0-9]+$/.test(x)||/^(i|ii|iii|iv|v|vi)$/.test(x);while(t.length>1&&isNum(t[t.length-1]))t.pop();return t.join(" ");}
const CORE=new Map();{const acc=new Map();for(const[k,r]of INDEX){const c=coreKey(k);if(c.length<5)continue;if(!acc.has(c))acc.set(c,new Set());acc.get(c).add(r);}for(const[c,rs]of acc)if(rs.size===1)CORE.set(c,[...rs][0]);}

function resolveBairro(bairro){
  const k=key(bairro);
  if(INDEX.has(k)) return {regiao:INDEX.get(k),how:"exato"};
  const c=coreKey(k);
  if(c.length>=5&&CORE.has(c)) return {regiao:CORE.get(c),how:"nucleo"};
  return {regiao:null,how:"indefinida"};
}

const STREETS = [
  "Avenida Sao Joao",
  "Rua Paraibuna",
  "Avenida Doutor Nelson D'Avila",
  "Avenida Sao Jose",
  "Rua Doutor Jose de Moura Resende",
  "Avenida Andromeda",
  "Avenida Cidade Jardim",
  "Estrada Municipal Eugenio de Melo",
  "Rua Inconfidencia",
  "Avenida Adhemar de Barros",
  "Rua Major Antonio Domingues",
  "Avenida Possidonio Jose de Freitas",
];

const sleep = ms => new Promise(r=>setTimeout(r,ms));

async function fetchStreet(street){
  const url = `https://viacep.com.br/ws/SP/Sao%20Jose%20dos%20Campos/${encodeURIComponent(street)}/json/`;
  const res = await fetch(url, {headers:{"User-Agent":"Mozilla/5.0"}});
  if(!res.ok) return {street, error:`http ${res.status}`};
  const data = await res.json();
  if(!Array.isArray(data)) return {street, error:"nao-array", raw:data};
  return {street, count:data.length, rows:data};
}

const out = [];
for(const s of STREETS){
  try{
    const r = await fetchStreet(s);
    if(r.error){ out.push({street:s, error:r.error}); await sleep(400); continue; }
    const seen = new Map(); // bairro -> {regiao,how,count}
    for(const row of r.rows){
      const b = row.bairro || "(vazio)";
      const rr = resolveBairro(b);
      if(!seen.has(b)) seen.set(b,{regiao:rr.regiao,how:rr.how,n:0});
      seen.get(b).n++;
    }
    const bairros = [...seen.entries()].map(([b,v])=>({bairro:b,regiao:v.regiao,how:v.how,ceps:v.n}));
    const regioes = new Set(bairros.map(b=>b.regiao).filter(Boolean));
    const semRegiao = bairros.filter(b=>!b.regiao).map(b=>b.bairro);
    out.push({
      street:s, totalCeps:r.count,
      distinctBairros:bairros.length,
      distinctRegioes:[...regioes],
      ambiguo: regioes.size>1,
      bairros,
      semRegiaoResolvida: semRegiao,
    });
    await sleep(400);
  }catch(e){ out.push({street:s, error:String(e.message||e)}); await sleep(400); }
}

console.log(JSON.stringify(out, null, 2));
