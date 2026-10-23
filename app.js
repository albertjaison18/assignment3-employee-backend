// Task1: initiate app and run server at 3000
const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '.env'), quiet: true });

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: false, limit: '16kb' }));

const path=require('path');
app.use(express.static(path.join(__dirname+'/dist/FrontEnd')));
// Task2: create mongoDB connection 
// The supplied static path uses different capitalization. Keep it intact and
// add the exact archive directory so assets also work on Linux.
app.use(express.static(path.join(__dirname, 'dist', 'Frontend')));

const employeeSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    location: { type: String, required: true, trim: true, maxlength: 120 },
    position: { type: String, required: true, trim: true, maxlength: 120 },
    salary: { type: Number, required: true, min: 0 }
}, { collection: 'employees', versionKey: false });
const Employee = mongoose.model('Employee', employeeSchema);

function apiError(status, message) {
    return Object.assign(new Error(message), { status });
}

function employeeId(value) {
    if (typeof value !== 'string' || !/^[a-f\d]{24}$/i.test(value)) {
        throw apiError(400, 'A valid employee _id is required.');
    }
    return value;
}

function employeeData(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw apiError(400, 'An employee object is required.');
    }
    const data = {};
    for (const field of ['name', 'location', 'position']) {
        if (typeof body[field] !== 'string' || !body[field].trim() || body[field].trim().length > 120) {
            throw apiError(400, `${field} must contain between 1 and 120 characters.`);
        }
        data[field] = body[field].trim();
    }
    if (!['number', 'string'].includes(typeof body.salary) ||
        (typeof body.salary === 'string' && !body.salary.trim()) ||
        !Number.isFinite(Number(body.salary)) || Number(body.salary) < 0) {
        throw apiError(400, 'salary must be a finite, non-negative number.');
    }
    data.salary = Number(body.salary);
    return data;
}

function asyncRoute(handler) {
    return (req, res, next) => Promise.resolve().then(() => handler(req, res)).catch(next);
}

// Reject requests promptly if the database connection is interrupted.
app.use('/api', (req, res, next) => {
    if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ message: 'Database temporarily unavailable.' });
    }
    next();
});


//Task 2 : write api with error handling and appropriate api mentioned in the TODO below







//TODO: get data from db  using api '/api/employeelist'
app.get('/api/employeelist', asyncRoute(async (req, res) => {
    res.json(await Employee.find().lean());
}));




//TODO: get single data from db  using api '/api/employeelist/:id'
app.get('/api/employeelist/:id', asyncRoute(async (req, res) => {
    const employee = await Employee.findById(employeeId(req.params.id)).lean();
    if (!employee) throw apiError(404, 'Employee not found.');
    res.json(employee);
}));





//TODO: send data from db using api '/api/employeelist'
//Request body format:{name:'',location:'',position:'',salary:''}
app.post('/api/employeelist', asyncRoute(async (req, res) => {
    const employee = await Employee.create(employeeData(req.body));
    res.status(201).json(employee);
}));






//TODO: delete a employee data from db by using api '/api/employeelist/:id'
app.delete('/api/employeelist/:id', asyncRoute(async (req, res) => {
    const employee = await Employee.findByIdAndDelete(employeeId(req.params.id));
    if (!employee) throw apiError(404, 'Employee not found.');
    res.json({ message: 'Employee deleted.', _id: employee._id });
}));





//TODO: Update  a employee data from db by using api '/api/employeelist'
//Request body format:{name:'',location:'',position:'',salary:''}
// The supplied frontend sends the fetched employee, including _id, in the body.
app.put(['/api/employeelist', '/api/employeelist/:id'], asyncRoute(async (req, res) => {
    const id = employeeId(req.params.id || (req.body && req.body._id));
    const employee = await Employee.findByIdAndUpdate(id,
        { $set: employeeData(req.body) }, { new: true, runValidators: true });
    if (!employee) throw apiError(404, 'Employee not found.');
    res.json(employee);
}));

// Keep unknown API requests from falling through to the Angular index page.
app.use('/api', (req, res) => {
    res.status(404).json({ message: 'API endpoint not found.' });
});


//! dont delete this code. it connects the front end file.
app.get('/*', function (req, res) {
    res.sendFile(path.join(__dirname + '/dist/Frontend/index.html'));
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ message: 'Request body must contain valid JSON.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ message: 'Request body is too large.' });
    }
    if (error.name === 'ValidationError' || error.name === 'CastError') {
        return res.status(400).json({ message: 'Employee data is invalid.' });
    }
    const status = error.status || 500;
    res.status(status).json({ message: status < 500 ? error.message : 'Unable to complete the request.' });
});

async function startServer() {
    if (!process.env.MONGODB_URI) {
        throw new Error('Set MONGODB_URI in .env before starting the application.');
    }
    if (process.env.DNS_SERVERS) {
        require('dns').setServers(process.env.DNS_SERVERS.split(',').map(value => value.trim()));
    }
    await mongoose.connect(process.env.MONGODB_URI, {
        dbName: process.env.MONGODB_DB || 'employee_app_assignment3',
        serverSelectionTimeoutMS: 10000,
        bufferCommands: false
    });
    const port = Number(process.env.PORT || 3000);
    const server = app.listen(port, () => {
        console.log(`MongoDB connected. Employee App running at http://localhost:${port}`);
    });
    server.on('error', async error => {
        console.error(`Server could not start (${error.code || error.name}).`);
        await mongoose.disconnect();
        process.exitCode = 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM']) {
        process.once(signal, () => {
            server.close(async () => {
                await mongoose.disconnect();
                process.exit(0);
            });
        });
    }
    return server;
}

if (require.main === module) {
    startServer().catch(async error => {
        // Avoid logging connection strings or credentials on startup failure.
        console.error(process.env.MONGODB_URI
            ? `Startup failed (${error.code || error.name}). Check Atlas credentials, network access, and DNS.`
            : error.message);
        await mongoose.disconnect();
        process.exitCode = 1;
    });
}

module.exports = { app, startServer };



