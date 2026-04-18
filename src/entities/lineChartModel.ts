import type { LineChartPoint } from './lineChartPoint'
import type { LineChartSeries } from './lineChartSeries'


export type LineChartModel = {
    data: LineChartPoint[]
    series: LineChartSeries[]
}