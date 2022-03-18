import { useCallback, useEffect, useRef, useState } from 'react';
import Highcharts from 'highcharts';
import { TimeSeriesDataset, TimeSeriesData, sliceTimeSeriesDataset } from './utils';
import dayjs from 'dayjs';

Highcharts.setOptions({
  lang: {
    decimalPoint: '.',
    thousandsSep: ',',
  },
});

const FPS = 10;
const MOVEMENT_SIZE = 7;
const BASE_CHART_OPTIONS: Highcharts.Options = {
  chart: {
    height: 600,
    width: 1200,
    type: 'spline',
    animation: true, // don't animate in old IE
    marginRight: 10,
  },
  plotOptions: {
    series: {
      marker: {
        enabled: false,
      },
    },
  },
  time: { useUTC: false },
  title: { text: 'Live language changes' },
  xAxis: {
    type: 'datetime',
    labels: {
      format: '{value:%Y-%m-%d}',
    },
    // tickPixelInterval: 150,
  },
  yAxis: {
    title: { text: 'Lines' },
    labels: {
      format: '{value:,.0f}',
    },
    plotLines: [
      {
        value: 0,
        width: 1,
        color: '#808080',
      },
    ],
  },
  tooltip: {
    headerFormat: '<b>{series.name}</b><br/>',
    pointFormat: '{point.x:%Y-%m-%d %H:%M:%S}<br/>{point.y}',
  },
  legend: { enabled: true },
  exporting: { enabled: false },
};

const toHighchartSeries = (dataset: TimeSeriesDataset): Highcharts.SeriesSplineOptions[] =>
  dataset.data.map((timeSeriesData: TimeSeriesData) => ({
    name: timeSeriesData.language,
    data: timeSeriesData.data.map((value, index) => [
      timeSeriesData.date[index].toDate().getTime(),
      value,
    ]),
    type: 'spline',
  }));

type HighchartOptionResult = {
  // if the chart is running
  animating: boolean;
  // the options for the chart
  options?: Highcharts.Options;
  // animate controller
  start: () => void;
  pause: () => void;
  stop: () => void;
};

type HighchartHookOptions = {
  animate?: {
    autoStart?: boolean;
    windowSize: number;
  };
};

export const useHighchart = (
  dataset: TimeSeriesDataset | null,
  options: HighchartHookOptions
): HighchartOptionResult => {
  const [timeoutRef, setTimeoutRef] = useState(0);
  const chartRef = useRef<Highcharts.Chart>();
  const nextStartDate = useRef<dayjs.Dayjs>();
  // handler for starting the timer to animate the chart
  const start = useCallback(() => {
    if (!options.animate) {
      // no animate, no start/pause
      return;
    }
    if (timeoutRef || !chartRef.current || !dataset || !nextStartDate.current) {
      return;
    }
    const { windowSize } = options.animate;
    const series = chartRef.current.series;
    setTimeoutRef(
      window.setInterval(() => {
        // move the data
        const sliced = sliceTimeSeriesDataset(dataset, nextStartDate.current!, MOVEMENT_SIZE);
        const timeSeries = toHighchartSeries(sliced);
        // merge data, update, and animate them.
        // TODO: remove series data if they are outdated.
        series.forEach((hcSeries: Highcharts.Series, index: number) => {
          let newData = [...hcSeries.data, ...timeSeries[index].data!];
          if (newData.length > windowSize) {
            newData = newData.slice(newData.length - windowSize);
          }
          hcSeries.setData(newData, true, true, true);
        });
        nextStartDate.current = nextStartDate.current!.add(MOVEMENT_SIZE, 'd');
      }, 1000 / FPS)
    );
  }, [dataset, options.animate, timeoutRef]);
  // handler for pausing the timer to animate the chart
  const pause = useCallback(() => {
    if (!options.animate) {
      // no animate, no start/pause
      return;
    }
    if (!timeoutRef) {
      return;
    }
    window.clearInterval(timeoutRef);
    setTimeoutRef(0);
  }, [options, timeoutRef]);
  const stop = useCallback(() => {
    if (!options.animate) {
      // no animate, no start/pause
      return;
    }
    pause();
    nextStartDate.current = dataset?.startDate.add(options.animate.windowSize, 'd');
  }, [dataset?.startDate, options.animate, pause]);
  // initialization code.
  useEffect(() => {
    if (!options.animate) {
      // no animate, no start/pause
      return;
    }
    if (!nextStartDate.current) {
      nextStartDate.current = dataset?.startDate.add(options.animate.windowSize, 'd');
      if (options.animate.autoStart) {
        setTimeout(start);
      }
    }
  }, [dataset, options.animate, start]);
  // callback to update the reference
  const handleChartLoad = useCallback((chart) => (chartRef.current = chart), []);
  // We try to build the current chart options without memo it.
  const buildChartOptions = () => {
    if (!dataset) {
      return undefined;
    }
    let chartSeries;
    if (options.animate) {
      const startDate = nextStartDate.current
        ? nextStartDate.current.add(-options.animate.windowSize, 'd')
        : dataset.startDate;
      const sliced = sliceTimeSeriesDataset(dataset, startDate, options.animate.windowSize);
      chartSeries = toHighchartSeries(sliced);
    } else {
      chartSeries = toHighchartSeries(dataset);
    }
    return {
      ...BASE_CHART_OPTIONS,
      chart: {
        ...BASE_CHART_OPTIONS.chart,
        events: {
          // we cannot use arrow function because we need `this` to get the series.
          load: function () {
            handleChartLoad(this);
          },
        },
      },
      series: chartSeries,
    };
  };
  return {
    start,
    pause,
    stop,
    animating: !!timeoutRef,
    options: buildChartOptions(),
  };
};
