"use strict";

$(function () {
  getCardChart();
  chart1();
  lineChart();
  dumbbellPlotChart();

  if ($("#project-team-scroll").length) {
    $("#project-team-scroll")
      .css({
        height: 400,
      })
      .niceScroll();
  }
  if ($("#project-list").length) {
    $("#project-list")
      .css({
        height: 400,
      })
      .niceScroll();
  }
  if ($("#client-details").length) {
    $("#client-details")
      .css({
        height: 400,
      })
      .niceScroll();
  }
});

function getCardChart() {
  var randomFromArray = function (array) {
    var currentIndex = array.length,
      temporaryValue,
      randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  };

  var chartData = [47, 29, 54, 34, 41, 22, 48, 53, 22, 20, 50, 59, 56, 45, 48];

  // chart 1
  var card1 = {
    chart: {
      type: "area",
      height: 50,
      sparkline: {
        enabled: true,
      },
    },
    stroke: {
      width: 2,
    },
    series: [
      {
        data: randomFromArray(chartData),
      },
    ],
    colors: ["#FA9313"],
    tooltip: {
      theme: "dark",
      marker: {
        show: true,
      },
      x: {
        show: false,
      },
    },
  };
  var card1 = new ApexCharts(document.querySelector("#cardChart1"), card1);
  card1.render();

  // chart 2
  var card2 = {
    chart: {
      type: "area",
      height: 50,
      sparkline: {
        enabled: true,
      },
    },
    stroke: {
      width: 2,
    },
    series: [
      {
        data: randomFromArray(chartData),
      },
    ],
    colors: ["#99C853"],
    tooltip: {
      theme: "dark",
      marker: {
        show: true,
      },
      x: {
        show: false,
      },
    },
  };
  var card2 = new ApexCharts(document.querySelector("#cardChart2"), card2);
  card2.render();

  // chart 3
  var card3 = {
    chart: {
      type: "area",
      height: 50,
      sparkline: {
        enabled: true,
      },
    },
    stroke: {
      width: 2,
    },
    series: [
      {
        data: randomFromArray(chartData),
      },
    ],
    colors: ["#1B55E2"],
    tooltip: {
      theme: "dark",
      marker: {
        show: true,
      },
      x: {
        show: false,
      },
    },
  };
  var card3 = new ApexCharts(document.querySelector("#cardChart3"), card3);
  card3.render();

  // chart 4
  var card4 = {
    chart: {
      type: "area",
      height: 50,
      sparkline: {
        enabled: true,
      },
    },
    stroke: {
      width: 2,
    },
    series: [
      {
        data: randomFromArray(chartData),
      },
    ],
    colors: ["#E7515A"],
    tooltip: {
      theme: "dark",
      marker: {
        show: true,
      },
      x: {
        show: false,
      },
    },
  };
  var card4 = new ApexCharts(document.querySelector("#cardChart4"), card4);
  card4.render();
}

function chart1() {
  var options = {
    series: [
      {
        name: "series1",
        data: [81, 90, 78, 101, 92, 109, 100],
      },
      {
        name: "series2",
        data: [61, 82, 95, 82, 84, 102, 91],
      },
    ],
    chart: {
      height: 380,
      type: "area",
      dropShadow: {
        enabled: true,
        opacity: 0.3,
        blur: 5,
        left: -7,
        top: 22,
      },
      toolbar: {
        show: false,
      },
    },
    colors: ["#6777EF", "#FEB019"],
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      curve: "smooth",
      width: 3,
      lineCap: "square",
    },
    xaxis: {
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
      crosshairs: {
        show: true,
      },
      categories: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
      labels: {
        style: {
          colors: "#9aa0ac",
        },
      },
    },
    yaxis: {
      labels: {
        style: {
          colors: "#9aa0ac",
        },
      },
    },
    legend: {
      show: false,
    },
    tooltip: {
      theme: "dark",
      marker: {
        show: true,
      },
      x: {
        show: true,
      },
    },
  };

  var chart = new ApexCharts(document.querySelector("#chart1"), options);
  chart.render();

  $('#chart-tabs a[data-toggle="tab"]').on("shown.bs.tab", function (e) {
    var id = $(this).attr("data-id");
    if (id && id === "1") {
      chart.updateSeries([
        {
          name: "income",
          data: [15, 48, 36, 20, 40, 60, 35, 20],
        },
        {
          name: "expense",
          data: [8, 22, 60, 35, 17, 24, 48, 37],
        },
      ]);
    } else if (id && id === "2") {
      chart.updateSeries([
        {
          name: "income",
          data: [19, 38, 43, 27, 44, 55, 32, 26],
        },
        {
          name: "expense",
          data: [12, 20, 58, 39, 21, 31, 41, 37],
        },
      ]);
    } else if (id && id === "3") {
      chart.updateSeries([
        {
          name: "income",
          data: [10, 28, 22, 32, 41, 51, 42, 30],
        },
        {
          name: "expense",
          data: [17, 22, 42, 35, 31, 28, 53, 31],
        },
      ]);
    }
  });
}
function lineChart() {
  am5.ready(function () {
    var root = am5.Root.new("amchartLineDashboard");

    const myTheme = am5.Theme.new(root);

    myTheme.rule("AxisLabel", ["minor"]).setAll({
      dy: 1,
    });

    myTheme.rule("Grid", ["minor"]).setAll({
      strokeOpacity: 0.08,
    });

    root.setThemes([am5themes_Animated.new(root), myTheme]);

    var chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: false,
        panY: false,
        wheelX: "panX",
        wheelY: "zoomX",
        paddingLeft: 0,
      })
    );

    var cursor = chart.set(
      "cursor",
      am5xy.XYCursor.new(root, {
        behavior: "zoomX",
      })
    );
    cursor.lineY.set("visible", false);

    var date = new Date();
    date.setHours(0, 0, 0, 0);
    var value = 100;

    function generateData() {
      value = Math.round(Math.random() * 10 - 5 + value);
      am5.time.add(date, "day", 1);
      return {
        date: date.getTime(),
        value: value,
      };
    }

    function generateDatas(count) {
      var data = [];
      for (var i = 0; i < count; ++i) {
        data.push(generateData());
      }
      return data;
    }

    var xAxis = chart.xAxes.push(
      am5xy.DateAxis.new(root, {
        maxDeviation: 0,
        baseInterval: {
          timeUnit: "day",
          count: 1,
        },
        renderer: am5xy.AxisRendererX.new(root, {
          minorGridEnabled: true,
          minGridDistance: 200,
          minorLabelsEnabled: true,
        }),
        tooltip: am5.Tooltip.new(root, {}),
      })
    );

    xAxis.set("minorDateFormats", {
      day: "dd",
      month: "MM",
    });

    var yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        renderer: am5xy.AxisRendererY.new(root, {}),
      })
    );

    xAxis
      .get("renderer")
      .labels.template.adapters.add("fill", (fill, target) => {
        return "#9aa0ac";
      });
    yAxis
      .get("renderer")
      .labels.template.adapters.add("fill", (fill, target) => {
        return "#9aa0ac";
      });

    var series = chart.series.push(
      am5xy.LineSeries.new(root, {
        name: "Series",
        xAxis: xAxis,
        yAxis: yAxis,
        valueYField: "value",
        valueXField: "date",
        tooltip: am5.Tooltip.new(root, {
          labelText: "{valueY}",
        }),
      })
    );

    series.bullets.push(function () {
      var bulletCircle = am5.Circle.new(root, {
        radius: 5,
        fill: series.get("fill"),
      });
      return am5.Bullet.new(root, {
        sprite: bulletCircle,
      });
    });

    var data = generateDatas(30);
    series.data.setAll(data);

    series.appear(1000);
    chart.appear(1000, 100);
  });
}

function dumbbellPlotChart() {
  am5.ready(function () {
    var root = am5.Root.new("dumbbellPlotChart");

    root.setThemes([am5themes_Animated.new(root)]);

    var chart = root.container.children.push(
      am5xy.XYChart.new(root, {
        panX: true,
        panY: true,
        wheelX: "panX",
        wheelY: "zoomX",
        pinchZoomX: true,
        paddingLeft: 0,
      })
    );

    var cursor = chart.set("cursor", am5xy.XYCursor.new(root, {}));
    cursor.lineY.set("visible", false);

    var xRenderer = am5xy.AxisRendererX.new(root, {
      minGridDistance: 30,
      minorGridEnabled: true,
    });
    xRenderer.labels.template.setAll({
      rotation: -90,
      centerY: am5.p50,
      centerX: 0,
    });

    xRenderer.grid.template.setAll({
      visible: false,
    });

    var xAxis = chart.xAxes.push(
      am5xy.CategoryAxis.new(root, {
        maxDeviation: 0.3,
        categoryField: "category",
        renderer: xRenderer,
        tooltip: am5.Tooltip.new(root, {}),
      })
    );

    var yAxis = chart.yAxes.push(
      am5xy.ValueAxis.new(root, {
        maxDeviation: 0.3,
        renderer: am5xy.AxisRendererY.new(root, {}),
      })
    );

    var series = chart.series.push(
      am5xy.ColumnSeries.new(root, {
        name: "Series 1",
        xAxis: xAxis,
        yAxis: yAxis,
        valueYField: "close",
        openValueYField: "open",
        categoryXField: "category",
        tooltip: am5.Tooltip.new(root, {
          labelText: "{openValueY} - {valueY}",
        }),
      })
    );
    series.columns.template.setAll({
      width: 0.5,
    });

    series.bullets.push(function () {
      return am5.Bullet.new(root, {
        locationY: 0,
        sprite: am5.Circle.new(root, {
          radius: 5,
          fill: series.get("fill"),
        }),
      });
    });

    var nextColor = chart.get("colors").getIndex(1);

    series.bullets.push(function () {
      return am5.Bullet.new(root, {
        locationY: 1,
        sprite: am5.Circle.new(root, {
          radius: 5,
          fill: nextColor,
        }),
      });
    });

    // Set data
    var data = [];
    var open = 100;
    var close = 120;

    var names = [
      "Raina",
      "Demarcus",
      "Carlo",
      "Jacinda",
      "Richie",
      "Antony",
      "Amada",
      "Idalia",
      "Janella",
      "Marla",
      "Curtis",
      "Shellie",
      "Meggan",
    ];

    for (var i = 0; i < names.length; i++) {
      open += Math.round((Math.random() < 0.5 ? 1 : -1) * Math.random() * 5);
      close = open + Math.round(Math.random() * 10) + 3;
      data.push({
        category: names[i],
        open: open,
        close: close,
      });
    }

    xAxis
      .get("renderer")
      .labels.template.adapters.add("fill", (fill, target) => {
        return "#9aa0ac";
      });
    yAxis
      .get("renderer")
      .labels.template.adapters.add("fill", (fill, target) => {
        return "#9aa0ac";
      });

    xAxis.data.setAll(data);
    series.data.setAll(data);

    series.appear(1000);
    chart.appear(1000, 100);
  });
}
