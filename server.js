"use strict";

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cors = require("cors");
const mongo = require("mongodb");
const mongoose = require("mongoose");

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

var Schema = mongoose.Schema;

//Schema for execises

var SchemaLog = new Schema({
  description: { type: String, required: true },
  duration: { type: Number, required: true },
  date: { type: Date, default: Date.now, required: true }
});

var SchemaData = new Schema({
  name: { type: String, required: true },
  count: { type: Number, required: true, default: 0 },
  log: [SchemaLog]
});

var datalog = mongoose.model("datalog", SchemaData);

app.post(
  "/api/exercise/new-user",
  (req, res, next) => {
    datalog.find({ name: req.body.username }, function(err, data) {
      if (err) {
        console.log(err);
        return;
      }

      req.username = data[0];
      next();
    });
  },
  (req, res, next) => {
    if (req.username != undefined) {
      return next({ status: 404, message: "username already taken" });
    }

    return next();
  },
  (req, res, next) => {
    var NewUser = new datalog({ name: req.body.username });
    NewUser.save(function(err, data) {
      if (err) {
        console.log(err);
        return;
      }

      console.log(data);

      res.json({ username: data.name, _id: data._id });
      return;
    });
  }
);

app.post(
  "/api/exercise/add",
  (req, res, next) => {
    if (req.body.userId.length != 24) {
      return next({ status: 400, message: "unknown _id" });
    } else if (req.body.duration.length == 0) {
      return next({ status: 400, message: "Path `duration` is required." });
    } else if (req.body.description.length == 0) {
      return next({ status: 400, message: "Path `description` is required." });
    } else if (isNaN(req.body.duration) == true) {
      return next({
        status: 400,
        message:
          'Cast to Number failed for value "' +
          req.body.duration +
          '" at path "duration"'
      });
    } else if (req.body.date.length != 0) {
      req.date = new Date(req.body.date);

      if (req.date == "Invalid Date") {
        return next({
          status: 400,
          message:
            'Cast to Date failed for value "' +
            req.body.date +
            '" at path "date"'
        });
      }
    }

    datalog.findById(req.body.userId, function(err, data) {
      if (err) {
        console.log(err);
        return;
      }

      req.userFound = data;
      next();
    });
  },
  (req, res, next) => {
    if (req.userFound == undefined) {
      return next({ status: 400, message: "unknown _id" });
    }

    next();
  },
  (req, res, next) => {
    req.userFound.log[req.userFound.count++] = {
      description: req.body.description,
      duration: req.body.duration
    };

    if (req.body.date.length != 0) {
      req.userFound.log[req.userFound.count - 1].date = new Date(req.body.date);
    }

    req.userFound.save(function(err, data) {
      if (err) {
        console.log(err);
        return;
      }
      console.log(data);
      res.json({
        username: data.name,
        description: req.body.description,
        duration: req.body.duration,
        _id: data._id,
        date: data.log[req.userFound.count - 1].date.toDateString()
      });
      return;
    });
  }
);

app.get(
  "/api/exercise/log",
  (req, res, next) => {
    
    if (req.query.userId.length != 24) {
      return next({ status: 400, message: "unknown userId" });
    }
     
    var query_mongo = {
      _id: req.query.userId
    };
    
    req.cbs_filer = [];

    if (req.query.to != undefined) {

      if (new Date(req.query.to) != "Invalid Date") {
        req.to = new Date(req.query.to);
        req.cbs_filer.push(function(item){
          return item.date <= req.to;          
        });
      }
    }
    
    if (req.query.from != undefined) {
      
      if (new Date(req.query.from) != "Invalid Date") {
        req.from = new Date(req.query.from);
        req.cbs_filer.push(function(item){
          return item.date >= req.from;          
        });
      }
    }
    
    
    
  var Query = datalog.find(query_mongo).select('-__v').lean();
  
  Query.exec(function(err, data) {
      if (err) {
        console.log(err);
        return;
      }

      req.userFound = data[0];
      
      req.cbs_filer.forEach(function (cb_function, index) {
        req.userFound.log = req.userFound.log.filter(cb_function);
      });
      
      req.userFound.count = req.userFound.log.length;
    
      if(req.query.limit != undefined) {
        if(isNaN(req.query.limit) != true) {
          req.userFound.log = req.userFound.log.slice(0,req.query.limit); 
          req.userFound.count = req.userFound.log.length;
        }
      }     
    
      req.userFound.log.forEach(function (item, index) {
        req.userFound.log[index].date = new Date(item.date).toDateString();
        delete req.userFound.log[index]['_id'];
      });
      
      next();
    });
  },
  (req, res, next) => {
    if (req.userFound == undefined) {
      return next({ status: 400, message: "unknown userId" });
    }

    res.json({"_id":req.userFound._id, "username":req.userFound.name, "count":req.userFound.count, "log": req.userFound.log});
    return;
  }
);

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/views/index.html");
});

//Not found middleware
app.use((req, res, next) => {
  return next({ status: 404, message: "not found" });
});

// Error Handling middleware
app.use((err, req, res, next) => {
  let errCode, errMessage;

  if (err.errors) {
    // mongoose validation error
    errCode = 400; // bad request
    const keys = Object.keys(err.errors);
    // report the first validation error
    errMessage = err.errors[keys[0]].message;
  } else {
    // generic or custom error
    errCode = err.status || 500;
    errMessage = err.message || "Internal Server Error";
  }
  res
    .status(errCode)
    .type("txt")
    .send(errMessage);
});

const listener = app.listen(process.env.PORT || 3000, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
