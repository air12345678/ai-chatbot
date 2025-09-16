# Database Configuration Guide

This AI chatbot can analyze **ANY SQL database** by simply changing the configuration. Here's how to set it up for different databases:

## 🎯 **Supported Database Types**

### **SQL Server** (Current - AdventureWorks)
```env
DB_TYPE=mssql
DB_SERVER=your-server.database.windows.net
DB_NAME=AdventureWorks2022
DB_USER=your-username
DB_PASSWORD=your-password
DB_PORT=1433
DB_ENCRYPT=true
```

### **MySQL**
```env
DB_TYPE=mysql
DB_HOST=localhost
DB_NAME=your_database
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=3306
```

### **PostgreSQL**
```env
DB_TYPE=postgresql
DB_HOST=localhost
DB_NAME=your_database
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=5432
```

### **SQLite**
```env
DB_TYPE=sqlite
DB_PATH=./database.db
```

### **Oracle**
```env
DB_TYPE=oracle
DB_HOST=localhost
DB_NAME=your_service_name
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=1521
```

## 🔧 **How to Switch Databases**

### **Step 1: Update Environment Variables**
Edit your `.env` file in the backend folder:

```env
# Database Configuration
DB_TYPE=mssql              # Change this to your database type
DB_SERVER=your-server      # Your database server
DB_NAME=your-database      # Your database name
DB_USER=your-username      # Your username
DB_PASSWORD=your-password  # Your password
DB_PORT=1433              # Database port

# AI Configuration (keep these)
OPENAI_API_KEY=your-openai-key
```

### **Step 2: Install Database Driver (if needed)**
```bash
# For MySQL
npm install mysql2

# For PostgreSQL
npm install pg @types/pg

# For SQLite
npm install sqlite3

# For Oracle
npm install oracledb
```

### **Step 3: Restart the Application**
```bash
npm run dev
```

## 📊 **Example Database Configurations**

### **Northwind Database (Classic Example)**
```env
DB_TYPE=mssql
DB_SERVER=your-server.database.windows.net
DB_NAME=Northwind
DB_USER=your-username
DB_PASSWORD=your-password
```

### **E-commerce Database**
```env
DB_TYPE=mysql
DB_HOST=localhost
DB_NAME=ecommerce_db
DB_USER=root
DB_PASSWORD=password
DB_PORT=3306
```

### **HR Management System**
```env
DB_TYPE=postgresql
DB_HOST=localhost
DB_NAME=hr_system
DB_USER=hr_admin
DB_PASSWORD=secure_password
DB_PORT=5432
```

## 🤖 **AI Adaptation**

The AI automatically adapts to your database by:

1. **Schema Discovery**: Automatically discovers all tables and columns
2. **Query Generation**: Generates SQL specific to your database type
3. **Business Context**: Learns your business domain from table/column names
4. **Smart Analysis**: Provides relevant business insights based on your data

## 💡 **Business Use Cases**

### **Retail & E-commerce**
- Sales performance analysis
- Customer behavior insights
- Inventory management
- Product profitability

### **Healthcare**
- Patient analytics
- Treatment effectiveness
- Resource utilization
- Operational efficiency

### **Finance**
- Transaction analysis
- Risk assessment
- Portfolio performance
- Compliance reporting

### **Manufacturing**
- Production efficiency
- Quality control
- Supply chain optimization
- Cost analysis

### **HR & People Analytics**
- Employee performance
- Recruitment metrics
- Compensation analysis
- Workforce planning

## 🚀 **Quick Start Examples**

Once configured, you can ask business questions like:

**For E-commerce:**
- "What are our top-selling products this month?"
- "Which customers have the highest lifetime value?"
- "How is our conversion rate trending?"

**For Healthcare:**
- "What's the average patient wait time?"
- "Which treatments have the best outcomes?"
- "How is bed utilization across departments?"

**For Finance:**
- "What's our monthly revenue growth?"
- "Which investments are performing best?"
- "How are our risk metrics trending?"

## 🛡️ **Security Notes**

- Store credentials in `.env` file (never commit to version control)
- Use read-only database users when possible
- Enable SSL/TLS encryption for remote connections
- Consider IP whitelisting for production deployments

## 📈 **Advanced Features**

The AI chatbot will automatically:
- **Learn Your Schema**: Understands table relationships
- **Business Context**: Infers business meaning from naming conventions
- **Performance Optimization**: Generates efficient queries
- **Export Capabilities**: Allows data export to Excel/CSV
- **Real-time Analysis**: Provides instant insights

---

**Ready to analyze YOUR database?** Just update the configuration and start asking business questions! 🎯
