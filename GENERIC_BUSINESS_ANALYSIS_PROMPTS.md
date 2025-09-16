# Generic Database - Advanced Business Analysis Prompts

## 🎯 Overview
This guide provides comprehensive analytical prompts for solving real business problems using any database schema. These prompts are completely database-agnostic and can be applied to any business domain detected through schema analysis.

---

## 📊 **PERFORMANCE ANALYSIS**

### 🔴 Problem 1: Trend Analysis
**Business Context:** Identify performance trends in key metrics.

**Analytical Prompts:**
```
"Show me monthly trends for our key metrics over the last year."

"Compare year-over-year performance and highlight areas with significant changes."

"Which categories are experiencing the most growth or decline?"

"Identify performance patterns by time period (daily, weekly, monthly, quarterly)."
```

### 🔴 Problem 2: Comparative Analysis
**Business Context:** Compare different dimensions of business performance.

**Analytical Prompts:**
```
"Compare performance between different categories/types over time."

"Show me the relative performance of our top 10 vs. bottom 10 items."

"Identify which factors have the strongest correlation with our key metrics."

"Compare performance before and after a significant event or change."
```

### 🔴 Problem 3: Outlier Identification
**Business Context:** Find exceptional cases that need attention.

**Analytical Prompts:**
```
"Identify outliers in our data that significantly differ from average performance."

"Which items have unusual patterns compared to others in the same category?"

"Find cases where the relationship between key metrics doesn't follow our typical pattern."

"Show me anomalies in our historical data that might indicate issues."
```

---

## 💰 **FINANCIAL ANALYSIS**

### 🔴 Problem 4: Profitability Analysis
**Business Context:** Understand drivers of profitability across the business.

**Analytical Prompts:**
```
"Calculate margins across different dimensions and identify which areas are most and least profitable."

"Show the relationship between volume and profitability - where are we seeing diminishing returns?"

"Which factors contribute most significantly to our overall profitability?"

"Analyze cost trends versus revenue trends to identify areas for improvement."
```

### 🔴 Problem 5: Resource Optimization
**Business Context:** Optimize allocation of limited resources.

**Analytical Prompts:**
```
"Identify high-value vs. low-value activities based on resource utilization and return."

"Which items have the highest turnover rates versus those with the lowest?"

"Calculate the financial impact of resource allocation decisions."

"Identify seasonal patterns that we could optimize for better resource management."
```

---

## 🎯 **OPERATIONAL EFFICIENCY**

### 🔴 Problem 6: Performance Benchmarking
**Business Context:** Compare performance across different dimensions.

**Analytical Prompts:**
```
"Rank performance by category and identify top performers versus underperformers."

"Show performance by location/region and identify significant variations."

"Which factors correlate most strongly with high performance?"

"Calculate efficiency ratios across different dimensions of our business."
```

### 🔴 Problem 7: Process Optimization
**Business Context:** Identify bottlenecks and improvement opportunities.

**Analytical Prompts:**
```
"Analyze process duration times and identify bottlenecks in our workflow."

"Show me which steps in our process have the highest failure/error rates."

"Compare process efficiency before and after implemented changes."

"Identify correlations between process variables and outcome quality."
```

---

## 🧠 **ADVANCED ANALYTICS**

### 🔴 Problem 8: Predictive Analysis
**Business Context:** Forecast future outcomes based on historical data.

**Analytical Prompts:**
```
"Based on historical patterns, predict future trends for our key metrics."

"Which factors are the strongest predictors of performance outcomes?"

"Show me expected seasonal variations based on historical patterns."

"Identify early indicators that can help us anticipate changes in performance."
```

### 🔴 Problem 9: Segmentation Analysis
**Business Context:** Identify meaningful groupings in your data.

**Analytical Prompts:**
```
"Segment our data based on key characteristics and show performance differences between segments."

"Identify clusters of similar items based on multiple attributes."

"Which segments show the most growth potential based on historical performance?"

"Compare the behavior and performance patterns across different segments."
```

### 🔴 Problem 10: Relationship Analysis
**Business Context:** Understand connections between different elements in your data.

**Analytical Prompts:**
```
"Show me relationships between different metrics and identify significant correlations."

"Analyze how changes in one area impact performance in related areas."

"Identify pairs or groups of items that frequently appear together."

"Map the network of relationships between different entities in our data."
```

---

## 📋 **USAGE GUIDELINES**

1. **Customize to Your Schema**: Once schema analysis is complete, replace generic terms with specific entity names from your database.

2. **Add Context**: Combine these prompts with specific business context from your organization.

3. **Refine Based on Results**: Use initial analysis to generate more specific follow-up questions.

4. **Balance Complexity**: Start with simpler analyses before moving to more complex ones.

5. **Consider Data Limitations**: Be aware of what data is available in your specific database schema.

6. **Focus on Actionable Insights**: Prioritize analyses that can lead to practical business decisions.

---

## 🌟 **GENERIC SQL PATTERNS**

These patterns can be customized based on schema analysis:

```sql
-- Basic trend analysis
SELECT [TimeColumn], COUNT(*)/SUM(*)/AVG(*) as Metric
FROM [MainTable]
GROUP BY [TimeColumn]
ORDER BY [TimeColumn];

-- Comparative analysis
SELECT [CategoryColumn], COUNT(*)/SUM(*)/AVG(*) as Metric
FROM [MainTable]
GROUP BY [CategoryColumn]
ORDER BY Metric DESC;

-- Before/After analysis
SELECT 
    CASE WHEN [TimeColumn] < 'pivotDate' THEN 'Before' ELSE 'After' END as Period,
    AVG([MetricColumn]) as AvgMetric
FROM [MainTable]
GROUP BY CASE WHEN [TimeColumn] < 'pivotDate' THEN 'Before' ELSE 'After' END;

-- Top/Bottom performers
SELECT TOP 10 [EntityColumn], SUM([MetricColumn]) as TotalMetric
FROM [MainTable]
GROUP BY [EntityColumn]
ORDER BY TotalMetric DESC;

-- Outlier detection
SELECT [EntityColumn], [MetricColumn]
FROM [MainTable]
WHERE [MetricColumn] > (SELECT AVG([MetricColumn]) + 2*STDEV([MetricColumn]) FROM [MainTable])
OR [MetricColumn] < (SELECT AVG([MetricColumn]) - 2*STDEV([MetricColumn]) FROM [MainTable]);
```
