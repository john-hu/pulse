import React, { useEffect, useState } from 'react';
import Highcharts from 'highcharts';
import HighchartsReact from 'highcharts-react-official';
import './App.css';
import data from './data.json';
import { TimeSeriesDataset, PulseData, toTimeSeriesDataset } from './utils';
import { useHighchart } from './hooks';

Highcharts.setOptions({
  lang: {
    decimalPoint: '.',
    thousandsSep: ',',
  },
});

const WINDOW_SIZE = 12 * 7; // 4 weeks.
const OPTIONS = {
  animate: { autoStart: false, windowSize: WINDOW_SIZE },
};
const App = () => {
  const [dataset, setDataset] = useState<TimeSeriesDataset | null>(null);
  const [animatingMode, setAnimatingMode] = useState(false);
  useEffect(() => {
    setDataset(toTimeSeriesDataset(data as PulseData[]));
  }, []);
  const { animating, options, start, stop, pause } = useHighchart(
    dataset,
    animatingMode ? OPTIONS : {}
  );

  return (
    <section className="App">
      <header>
        <button
          type="button"
          onClick={() => {
            setAnimatingMode(!animatingMode);
            animating && stop();
          }}
        >
          {animatingMode ? 'View all' : 'Animating'}
        </button>
        {animatingMode && (
          <>
            {' '}
            <button disabled={animating} type="button" onClick={start}>
              Start
            </button>{' '}
            <button disabled={!animating} type="button" onClick={pause}>
              Pause
            </button>{' '}
            <button disabled={!animating} type="button" onClick={stop}>
              Reset
            </button>
          </>
        )}
      </header>
      <div>
        {dataset && (
          <HighchartsReact
            containerProps={{ className: 'line-chart' }}
            highcharts={Highcharts}
            options={options}
            type="line"
            height={500}
          />
        )}
      </div>
    </section>
  );
};

export default App;
