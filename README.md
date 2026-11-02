# SIG Urbano Ponta Porã – MS

Aplicação web de mapeamento urbano (planta cadastral e bairros de Ponta Porã – MS). Permite desenhar e editar geometrias sobre o mapa, nomear feições, salvar seus mapas no navegador e exportar/imprimir o resultado.

## Funcionalidades

- Mapa base cadastral (Leaflet) com tiles vetoriais do OpenFreeMap e base clara CARTO
- Desenho e edição de pontos, linhas e polígonos (Leaflet-Geoman)
- Painel inspetor, rótulos rápidos e camada de bairros de Ponta Porã
- Busca de endereços (Nominatim / Photon)
- "Meus mapas": projetos salvos automaticamente no `localStorage` do navegador
- Exportação e impressão (GeoJSON, imagem, PDF)

## Tecnologias

React 19 · TypeScript · Vite · Tailwind CSS 4 · Leaflet · Leaflet-Geoman · jsPDF · html-to-image

## Como rodar localmente

Requer [Node.js](https://nodejs.org/) 20 ou superior.

```bash
npm install
npm run dev
```

Abra o endereço mostrado no terminal (normalmente http://localhost:5173).

## Build de produção

```bash
npm run build
npm run preview
```

O build gera um único arquivo `dist/index.html` (plugin `vite-plugin-singlefile`), que pode ser aberto diretamente ou hospedado em qualquer lugar.

## Publicação (GitHub Pages)

Este repositório já inclui o workflow `.github/workflows/deploy.yml`. Para ativar:

1. No GitHub, vá em **Settings → Pages**.
2. Em **Source**, escolha **GitHub Actions**.
3. A cada push na branch `main`, o site é publicado automaticamente.

## Estrutura

```
src/
├── components/   # Interface (cabeçalho, barras laterais, mapa, modais)
├── data/         # Dados dos bairros de Ponta Porã
├── map/          # Configuração da base cartográfica
├── types/        # Tipos TypeScript
└── utils/        # Geometria/GeoJSON, exportação e impressão
```

## Créditos de dados

Mapas © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, [OpenFreeMap](https://openfreemap.org), [CARTO](https://carto.com/attributions).
