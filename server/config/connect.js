const mongoose = require('mongoose')
const USers = require("../models/users")
const connect =async()=>{

try {
    
const connection =await mongoose.connect(process.env.MONGO_URI);
console.log("mongodb connected ✅✅");
console.log('Connected to:', mongoose.connection.name);


} catch (error) {
    
console.log("mongodb is not connected❌❌❌",error);


}
}
module.exports = connect;