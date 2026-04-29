import React, { useState, useEffect, useRef } from "react";
import {
	BarChart,
	CartesianGrid,
	Bar,
	XAxis,
	YAxis,
	Label,
	ResponsiveContainer,
	Tooltip,
	Cell,
} from "recharts";
import { startOfHour, parseISO, format } from "date-fns";

import { i18n } from "../../translate/i18n";
import Title from "./Title";
import useTickets from "../../hooks/useTickets";

const CustomTooltip = ({ active, payload, label }) => {
	if (active && payload && payload.length) {
		return (
			<div
				style={{
					backgroundColor: "#ffffff",
					border: "1px solid #E5E9EF",
					borderRadius: 10,
					padding: "8px 14px",
					boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
					fontFamily: '"DM Sans", system-ui, sans-serif',
				}}
			>
				<p style={{ margin: 0, fontSize: 12, color: "#9BA3B0", fontWeight: 600 }}>
					{label}
				</p>
				<p style={{ margin: "2px 0 0", fontSize: 16, color: "#0A0F1E", fontWeight: 700 }}>
					{payload[0].value} tickets
				</p>
			</div>
		);
	}
	return null;
};

const Chart = () => {
	const date = useRef(new Date().toISOString());
	const { tickets } = useTickets({ date: date.current });

	const [chartData, setChartData] = useState([
		{ time: "08:00", amount: 0 },
		{ time: "09:00", amount: 0 },
		{ time: "10:00", amount: 0 },
		{ time: "11:00", amount: 0 },
		{ time: "12:00", amount: 0 },
		{ time: "13:00", amount: 0 },
		{ time: "14:00", amount: 0 },
		{ time: "15:00", amount: 0 },
		{ time: "16:00", amount: 0 },
		{ time: "17:00", amount: 0 },
		{ time: "18:00", amount: 0 },
		{ time: "19:00", amount: 0 },
	]);

	useEffect(() => {
		setChartData(prevState =>
			prevState.map(a => {
				let count = 0;
				tickets.forEach(ticket => {
					if (format(startOfHour(parseISO(ticket.createdAt)), "HH:mm") === a.time) {
						count++;
					}
				});
				return { ...a, amount: count };
			})
		);
	}, [tickets]);

	const maxAmount = Math.max(...chartData.map(d => d.amount), 1);

	return (
		<React.Fragment>
			<Title>{`${i18n.t("dashboard.charts.perDay.title")}${tickets.length}`}</Title>
			<ResponsiveContainer width="100%" height="90%">
				<BarChart
					data={chartData}
					margin={{ top: 8, right: 8, bottom: 0, left: 16 }}
				>
					<CartesianGrid
						strokeDasharray="3 3"
						stroke="#E5E9EF"
						vertical={false}
					/>
					<XAxis
						dataKey="time"
						stroke="#E5E9EF"
						tick={{
							fill: "#9BA3B0",
							fontFamily: '"DM Sans", system-ui, sans-serif',
							fontSize: 12,
						}}
						axisLine={{ stroke: "#E5E9EF" }}
						tickLine={false}
					/>
					<YAxis
						type="number"
						allowDecimals={false}
						stroke="#E5E9EF"
						tick={{
							fill: "#9BA3B0",
							fontFamily: '"DM Sans", system-ui, sans-serif',
							fontSize: 12,
						}}
						axisLine={false}
						tickLine={false}
					>
						<Label
							angle={270}
							position="left"
							offset={-4}
							style={{
								textAnchor: "middle",
								fill: "#9BA3B0",
								fontFamily: '"DM Sans", system-ui, sans-serif',
								fontSize: 12,
							}}
						>
							Tickets
						</Label>
					</YAxis>
					<Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(37,211,102,0.06)" }} />
					<Bar dataKey="amount" radius={[5, 5, 0, 0]} maxBarSize={48}>
						{chartData.map((entry, index) => (
							<Cell
								key={`cell-${index}`}
								fill={
									entry.amount === maxAmount && entry.amount > 0
										? "#1DAB57"
										: "#25D366"
								}
								fillOpacity={entry.amount === 0 ? 0.25 : 1}
							/>
						))}
					</Bar>
				</BarChart>
			</ResponsiveContainer>
		</React.Fragment>
	);
};

export default Chart;
