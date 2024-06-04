const mongoose = require('mongoose')

/*
  Schema description:
    - imageID :  image id
    - website : the website name 
    - averageRating : the mean rating that was collected during the rating process only by users
*/
const ImageSchema = new mongoose.Schema({
    imageID: Number,
    website: String,
    averageRating: Number,
//   u: {
//     type: Boolean,
//     default: false
//   }
}, { collection: 'images' })


module.exports = mongoose.model('Image', ImageSchema)
