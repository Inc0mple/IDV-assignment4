// Set up dimensions - responsive width and adjusted margins
const width = document.querySelector(".map-container").offsetWidth; // Use container width
const height = 700;
const margin = { top: 40, right: 20, bottom: 30, left: 20 };

// Create SVG - set width to 100% to fill container
const svg = d3.select("#map")
  .attr("width", "100%")
  .attr("height", height)
  .attr("viewBox", `0 0 ${width} ${height}`); // Define viewBox

// Create a tooltip
const tooltip = d3.select("#tooltip");

// Color scale for population density - changed to Blues color scheme
const colorScale = d3.scaleSequential(d3.interpolateBlues)
  .domain([0, 50000]); // Will adjust based on data

// Load data
Promise.all([
  d3.json("data/sgmap.json"),
  d3.csv("data/population_by_subzone.csv")
]).then(([mapData, populationData]) => {
  // Process population data to get total population by subzone
  const populationBySubzone = {};
  const planningAreaBySubzone = {};

  populationData.forEach(d => {
    if (d.Subzone !== "Total") {
      // Store by both original name and uppercase for more flexible matching
      populationBySubzone[d.Subzone] = +d["Total Population"] || 0;
      populationBySubzone[d.Subzone.toUpperCase()] = +d["Total Population"] || 0;
      planningAreaBySubzone[d.Subzone] = d["Planning Area"];
    }
  });

  // Get planning area totals for comparison
  const planningAreaPopulation = {};
  populationData.forEach(d => {
    if (d.Subzone === "Total" && d["Planning Area"] !== "Total") {
      planningAreaPopulation[d["Planning Area"]] = +d["Total Population"] || 0;
    }
  });

  // Update color scale domain based on data
  const popValues = Object.values(populationBySubzone).filter(v => v > 0);
  const maxPop = d3.max(popValues) || 50000;
  colorScale.domain([0, maxPop]);

  // Create a projection for Singapore
  const projection = d3.geoMercator()
    .center([103.851959, 1.290270])
    .fitExtent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]], mapData);

  // Create a path generator
  const path = d3.geoPath().projection(projection);

  // Variable to store the currently zoomed subzone
  let zoomedSubzone = null;

  // Draw subzones with enhanced styling
  svg.append("g")
    .attr("class", "subzones")
    .selectAll("path")
    .data(mapData.features)
    .enter()
    .append("path")
    .attr("d", path)
    .attr("fill", d => {
      // Try multiple ways to match the name
      const name = d.properties.Name;
      const population =
        populationBySubzone[name] ||
        populationBySubzone[name.toUpperCase()] ||
        0;

      return population > 0 ? colorScale(population) : "#e0e0e0";
    })
    .attr("stroke", "#333")
    .attr("stroke-width", 0.8)
    .attr("data-name", d => d.properties.Name)
    .attr("data-population", d => populationBySubzone[d.properties.Name] || 0)
    .on("mouseover", function(event, d) {
      // Highlight the hovered subzone
      d3.select(this)
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .style("filter", "brightness(1.1)");

      // Get population for this subzone
      const population = populationBySubzone[d.properties.Name] || 0;
      const planningArea = d.properties["Planning Area Name"] || planningAreaBySubzone[d.properties.Name] || "N/A";
      const areaPopulation = planningAreaPopulation[planningArea] || 0;
      const percentOfArea = areaPopulation > 0 ? ((population / areaPopulation) * 100).toFixed(1) : 0;

      // Show tooltip with enhanced information
      const [mouseX, mouseY] = d3.pointer(event); // Get mouse coordinates relative to the SVG

      tooltip
        .style("left", (mouseX + 10) + "px")
        .style("top", (mouseY - 28) + "px")
        .style("opacity", 1)
        .html(`
          <strong>${d.properties.Name}</strong><br>
          <b>Planning Area:</b> ${planningArea}<br>
          <b>Region:</b> ${d.properties["Region Name"] || "N/A"}<br>
          <b>Population:</b> ${population.toLocaleString()}<br>
          ${percentOfArea > 0 ? `<b>% of Area:</b> ${percentOfArea}%` : ''}
        `);
    })
    .on("mouseout", function() {
      // Restore original appearance
      d3.select(this)
        .attr("stroke", "#333")
        .attr("stroke-width", 0.8)
        .style("filter", null);

      // Hide tooltip
      tooltip.style("opacity", 0);
    })
    .on("click", function(event, d) {
        // Check if this subzone is already zoomed
        if (zoomedSubzone === d) {
          // Reset zoom
          svg.transition()
            .duration(750)
            .call(
              zoom.transform,
              d3.zoomIdentity,
              d3.pointer(event)
            );
          zoomedSubzone = null; // Clear zoomed subzone
          d3.selectAll(".subzones path").style("stroke-width", 0.8); // Reset all strokes
        } else {
          // Zoom to the clicked subzone
          const bounds = path.bounds(d);
          const dx = bounds[1][0] - bounds[0][0];
          const dy = bounds[1][1] - bounds[0][1];
          const x = (bounds[0][0] + bounds[1][0]) / 2;
          const y = (bounds[0][1] + bounds[1][1]) / 2;
          const scale = 0.9 / Math.max(dx / width, dy / height);
          const translate = [width / 2 - scale * x, height / 2 - scale * y];

          svg.transition()
            .duration(750)
            .call(
              zoom.transform,
              d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
              d3.pointer(event)
            )
            .on("end", () => {
              // Reset previous zooms
              d3.selectAll(".subzones path").style("stroke-width", 0.8);

              // Highlight this zone
              d3.select(this).style("stroke-width", 1.5);

              zoomedSubzone = d; // Update zoomed subzone
            });
        }
      });

  // Add title to the map with improved positioning
  svg.append("text")
    .attr("x", width / 2)
    .attr("y", margin.top - 15) // Moved up higher above the map
    .attr("text-anchor", "middle")
    .attr("class", "map-title")
    .style("font-size", "18px")
    .style("font-weight", "bold")
    .text("Singapore Population by Subzone (2024)");

  // Create a legend
  createLegend(colorScale, maxPop);

  //Zoom Functionality
  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .on("zoom", function(event) {
      svg.selectAll("path")
        .attr("transform", event.transform);
    });

  svg.call(zoom);
});

// Function to create a color legend with more ticks and better formatting
function createLegend(colorScale, maxValue) {
  const legendWidth = 300;
  const legendHeight = 20;

  const legend = d3.select("#legend")
    .append("svg")
    .attr("width", legendWidth)
    .attr("height", 60);

  // Create gradient
  const defs = legend.append("defs");
  const gradient = defs.append("linearGradient")
    .attr("id", "legend-gradient")
    .attr("x1", "0%")
    .attr("y1", "0%")
    .attr("x2", "100%")
    .attr("y2", "0%");

  // Add more color stops for a smoother gradient
  const numStops = 10;
  for (let i = 0; i <= numStops; i++) {
    const offset = `${i * 100 / numStops}%`;
    const value = i * maxValue / numStops;
    gradient.append("stop")
      .attr("offset", offset)
      .attr("stop-color", colorScale(value));
  }

  // Add rectangle with gradient
  legend.append("rect")
    .attr("width", legendWidth)
    .attr("height", legendHeight)
    .style("fill", "url(#legend-gradient)");

  // Add legend axis with more ticks
  const legendScale = d3.scaleLinear()
    .domain([0, maxValue])
    .range([0, legendWidth]);

  const legendAxis = d3.axisBottom(legendScale)
    .ticks(6)
    .tickSize(4)
    .tickFormat(d => {
      if (d === 0) return "0";
      if (d >= 1000) return `${(d / 1000).toFixed(0)}k`; // Rounded to nearest k
      return d.toString();
    });

  legend.append("g")
    .attr("transform", `translate(0, ${legendHeight})`)
    .style("font-size", "10px") // Adjust font size here
    .call(legendAxis)
    .selectAll("text")
    .style("text-anchor", "middle");

  // Add title to legend
  legend.append("text")
    .attr("x", legendWidth / 2)
    .attr("y", 55)
    .attr("text-anchor", "middle")
    .attr("class", "legend-subtitle")
    .style("font-size", "10px")
    .text("Population Count");
}