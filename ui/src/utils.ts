import dayjs from 'dayjs';
import { orderBy } from 'lodash';

type LanguageHCMap = {
  [key: string]: TimeSeriesData;
};

export type PulseData = {
  dateTime: string;
  project: string;
  language: string;
  fileCount: number;
  blankLines: number;
  commentLines: number;
  codeLines: number;
};

export type TimeSeriesData = {
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  language: string;
  date: dayjs.Dayjs[];
  data: number[];
};

export type TimeSeriesDataset = {
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  data: TimeSeriesData[];
};

export const toTimeSeriesDataset = (data: PulseData[]): TimeSeriesDataset => {
  if (!data.length) {
    return {
      startDate: dayjs(),
      endDate: dayjs(),
      data: [],
    };
  }
  const sortedData = orderBy(data, ['dateTime', 'project', 'language']);
  const dataStartDate: dayjs.Dayjs = dayjs(sortedData[0].dateTime);
  const dataEndDate: dayjs.Dayjs = dayjs(sortedData[sortedData.length - 1].dateTime);
  const languageMap: LanguageHCMap = sortedData.reduce<LanguageHCMap>((acc, row) => {
    const dataDate = dayjs(row.dateTime);
    if (!acc[row.language]) {
      acc[row.language] = {
        startDate: dataDate,
        endDate: dataDate,
        date: [],
        data: [],
        language: row.language,
      };
    }
    const record = acc[row.language];
    // Some languages may be removed after introduced. We may have a situation like this:
    // JavaScript 2018 2/27, JavaScript 2018 3/4. We must fill the gap to display the data correctly.
    while (dataDate.diff(record.endDate, 'd') > 1) {
      record.endDate = record.endDate.add(1, 'd');
      record.date.push(record.endDate);
      record.data.push(0);
    }
    record.endDate = dataDate;
    record.date.push(dataDate);
    record.data.push(row.codeLines);
    return acc;
  }, {});
  const languages = Object.keys(languageMap).sort();
  return {
    startDate: dataStartDate,
    endDate: dataEndDate,
    data: languages.map((language) => {
      return languageMap[language];
    }),
  };
};

export const sliceTimeSeriesDataset = (
  dataset: TimeSeriesDataset,
  startDate: dayjs.Dayjs,
  count: number
): TimeSeriesDataset => {
  if (count < 0) {
    throw new Error(`count must be greater than 0, ${count}`);
  }
  let endDate: dayjs.Dayjs = startDate.add(count, 'day');
  if (endDate.diff(dataset.endDate) < 0) {
    endDate = dataset.endDate;
  }
  if (startDate.diff(dataset.startDate) < 0) {
    throw new Error(
      `startDate is less than whole dataset start: ${startDate} -> ${dataset.startDate}`
    );
  }
  return {
    startDate,
    endDate,
    data: dataset.data.map((timeSeriesData) => {
      let sliceStartDate = startDate;
      let sliceEndDate = startDate.add(count, 'd');
      // return empty when the start/end don't make sense.
      if (
        sliceEndDate.diff(timeSeriesData.startDate) < 0 ||
        sliceStartDate.diff(timeSeriesData.endDate) > 0
      ) {
        return {
          startDate: sliceStartDate,
          endDate: sliceEndDate,
          language: timeSeriesData.language,
          date: [],
          data: [],
        };
      }
      let sliceStartIndex = startDate.diff(timeSeriesData.startDate, 'd');
      let sliceCount = count;
      if (sliceStartIndex < 0) {
        sliceStartDate = timeSeriesData.startDate;
        // deduct the count from diff
        sliceCount += sliceStartIndex;
        sliceStartIndex = 0;
      }
      if (sliceEndDate.diff(timeSeriesData.endDate, 'd') > 0) {
        sliceEndDate = timeSeriesData.endDate;
        sliceCount = Math.max(sliceEndDate.diff(sliceStartDate, 'd') + 1, 0);
      }
      return {
        startDate: sliceStartDate,
        endDate: sliceEndDate,
        language: timeSeriesData.language,
        date: timeSeriesData.date.slice(sliceStartIndex, sliceStartIndex + sliceCount),
        data: timeSeriesData.data.slice(sliceStartIndex, sliceStartIndex + sliceCount),
      };
    }),
  };
};
