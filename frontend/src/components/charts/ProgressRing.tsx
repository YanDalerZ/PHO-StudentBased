import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface ProgressRingProps {
    data: any[]; // Expects an array like [{ name: 'Completed', value: 75 }, { name: 'Remaining', value: 25 }]
    title: string;
    completedColor?: string;
    remainingColor?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({ 
    data, 
    title,
    completedColor = "#10b981", // emerald-500
    remainingColor = "#f1f5f9"  // slate-100
}) => {
    // Assuming data[0] is completed and data[1] is remaining
    const percent = data.length > 0 ? Math.round((data[0].value / (data[0].value + (data[1]?.value || 0))) * 100) : 0;

    return (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center">
            <h3 className="text-sm font-semibold text-slate-700 mb-2 w-full text-left">{title}</h3>
            <div className="h-[250px] w-full relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={data}
                            cx="50%"
                            cy="50%"
                            innerRadius={70}
                            outerRadius={90}
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            stroke="none"
                        >
                            <Cell key="completed" fill={completedColor} />
                            <Cell key="remaining" fill={remainingColor} />
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-3xl font-bold text-slate-800">{percent}%</span>
                </div>
            </div>
        </div>
    );
};
