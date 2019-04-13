const fs = require('fs');
const path = require('path');

const { validationResult } = require('express-validator/check');
const io = require('../socket');

const Post = require('../models/post');
const User = require('../models/user');

/** using async await */

exports.getStatus = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user.status) {
      const error = new Error('Status cannot be found');
      error.statusCode = 422;
      throw error;
    }
    res.status(200).json({ status: user.status });
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
}

exports.updateStatus = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect');
    error.statusCode = 422;
    throw error;
  }
  try {
    const updatedStatus = req.body.status;
    const user = await User.findById(req.userId);
    if (!user) {
      const error = new Error('User does not exist');
      error.statusCode = 422;
      throw error;
    }
    user.status = updatedStatus;
    const result = await user.save();
    if (result) {
      res.status(200).json({ message: 'Status updated successfully' });
    }
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
}

exports.getPosts = async (req, res, next) => {
  try {
    const currentPage = req.query.page || 1;
    const perPage = 2;
    const totalItems = await Post.find()
      .countDocuments();

    const posts = await Post.find()
      .populate('creator')
      .sort({ "createdAt": -1 })
      .skip((currentPage - 1) * perPage)
      .limit(perPage);

    if (posts) {
      res.status(200)
        .json({ message: 'Fetched posts succesfully', posts: posts, totalItems: totalItems });
    }
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.createPost = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect');
    error.statusCode = 422;
    throw err;
  }

  if (!req.file) {
    const error = new Error('No image provided');
    error.statusCode = 422;
    throw error;
  }

  const imageUrl = req.file.path.replace("\\", '/');
  const title = req.body.title;
  const content = req.body.content;
  const post = new Post({
    title: title,
    content: content,
    imageUrl: imageUrl,
    creator: req.userId
  });

  try {
    await post.save();
    const user = await User.findById(req.userId);
    user.posts.push(post);
    await user.save();
    io.getIO().emit('posts',
      {
        action: 'create',
        post: { ...post._doc, creator: { _id: req.userId, name: user.name } }
      });
    res.status(201).json({
      message: 'Post created successfully!',
      post: post,
      creator: { _id: user._id, name: user.name }
    });
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
};

exports.getPost = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findById(postId).populate('creator');
    if (!post) {
      const error = new Error('Could not find post');
      error.statusCode = 404;
      throw error;
    }
    res.status(200).json({ message: 'Post fetched', post: post });
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
}

exports.updatePost = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error('Validation failed, entered data is incorrect');
    error.statusCode = 422;
    throw err;
  }
  const postId = req.params.postId;
  const title = req.body.title;
  const content = req.body.content;
  let imageUrl = req.body.image;
  if (req.file) {
    imageUrl = req.file.path;
  }
  if (!imageUrl) {
    const error = new Error('No file picked');
    error.statusCode = 404;
    throw error;
  }
  try {
    const post = await Post.findById(postId).populate('creator');
    if (!post) {
      const error = new Error('Could not find post');
      error.statusCode = 404;
      throw error;
    }

    if (post.creator._id.toString() !== req.userId) {
      const error = new Error('Not Authorized');
      error.statusCode = 403;
      throw error;
    }

    if (imageUrl !== post.imageUrl) {
      clearImage(post.imageUrl);
    }

    post.title = title;
    post.imageUrl = imageUrl;
    post.content = content;
    const result = await post.save();
    io.getIO().emit('posts', {
      action: 'update',
      post: post
    })
    res.status(200).json({ message: 'Post updated', post: result });
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500
    }
    throw err;
  }
}

exports.deletePost = async (req, res, next) => {
  try {
    const postId = req.params.postId;
    const post = await Post.findById(postId);
    if (!post) {
      const error = new Error('Could not find post');
      error.statusCode = 404;
      throw error;
    }
    if (post.creator.toString() !== req.userId) {
      const error = new Error('Not Authorized');
      error.statusCode = 403;
      throw error;
    }
    clearImage(post.imageUrl);
    await Post.findByIdAndRemove(postId);
    const user = await User.findById(req.userId);
    user.posts.pull(postId);
    await user.save();
    io.getIO().emit('posts', {
      action: 'delete',
      id: postId
    })
    res.status(200).json({ message: 'deleted post' });
  }
  catch (err) {
    if (!err.statusCode) {
      err.statusCode = 500;
    }
    next(err);
  }
}




/** using promises */

// exports.getStatus = (req, res, next) => {
//   User.findById(req.userId)
//     .then(user => {
//       if (!user.status) {
//         const error = new Error('Status cannot be found');
//         error.statusCode = 422;
//         throw error;
//       }
//       res.status(200).json({ status: user.status });
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     })
// }

// exports.updateStatus = (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     const error = new Error('Validation failed, entered data is incorrect');
//     error.statusCode = 422;
//     throw error;
//   }
//   const updatedStatus = req.body.status;
//   User.findById(req.userId)
//     .then(user => {
//       if (!user) {
//         const error = new Error('User does not exist');
//         error.statusCode = 422;
//         throw error;
//       }
//       user.status = updatedStatus;
//       return user.save();
//     })
//     .then(result => {
//       res.status(200).json({ message: 'Status updated successfully' })
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     })
// }

// exports.getPosts = (req, res, next) => {
//   const currentPage = req.query.page || 1;
//   const perPage = 2;
//   let totalItems;
//   Post.find()
//     .countDocuments()
//     .then(count => {
//       totalItems = count;
//       return Post.find()
//         .skip((currentPage - 1) * perPage)
//         .limit(perPage)
//     })
//     .then(posts => {
//       res.status(200)
//         .json({ message: 'Fetched posts succesfully', posts: posts, totalItems: totalItems });
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     });
// };

// exports.createPost = (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     const error = new Error('Validation failed, entered data is incorrect');
//     error.statusCode = 422;
//     throw err;
//   }

//   if (!req.file) {
//     const error = new Error('No image provided');
//     error.statusCode = 422;
//     throw error;
//   }

//   const imageUrl = req.file.path.replace("\\", '/');
//   let creator;
//   const title = req.body.title;
//   const content = req.body.content;
//   const post = new Post({
//     title: title,
//     content: content,
//     imageUrl: imageUrl,
//     creator: req.userId
//   });

//   post.save()
//     .then(result => {
//       return User.findById(req.userId);
//     })
//     .then(user => {
//       creator = user;
//       user.posts.push(post);
//       return user.save();
//     })
//     .then(result => {
//       res.status(201).json({
//         message: 'Post created successfully!',
//         post: post,
//         creator: { _id: creator._id, name: creator.name }
//       });
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     })

// };

// exports.getPost = (req, res, next) => {
//   const postId = req.params.postId;
//   Post.findById(postId)
//     .then(post => {
//       if (!post) {
//         const error = new Error('Could not find post');
//         error.statusCode = 404;
//         throw error;
//       }
//       res.status(200).json({ message: 'Post fetched', post: post });
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     })
// }

// exports.updatePost = (req, res, next) => {
//   const errors = validationResult(req);
//   if (!errors.isEmpty()) {
//     const error = new Error('Validation failed, entered data is incorrect');
//     error.statusCode = 422;
//     throw err;
//   }
//   const postId = req.params.postId;
//   const title = req.body.title;
//   const content = req.body.content;
//   let imageUrl = req.body.image;
//   if (req.file) {
//     imageUrl = req.file.path;
//   }
//   if (!imageUrl) {
//     const error = new Error('No file picked');
//     error.statusCode = 404;
//     throw error;
//   }

//   Post.findById(postId)
//     .then(post => {
//       if (!post) {
//         const error = new Error('Could not find post');
//         error.statusCode = 404;
//         throw error;
//       }

//       if (post.creator.toString() !== req.userId) {
//         const error = new Error('Not Authorized');
//         error.statusCode = 403;
//         throw error;
//       }

//       if (imageUrl !== post.imageUrl) {
//         clearImage(post.imageUrl);
//       }

//       post.title = title;
//       post.imageUrl = imageUrl;
//       post.content = content;
//       return post.save();
//     })
//     .then(result => {
//       res.status(200).json({ message: 'Post updated', post: result })
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     });
// }

// exports.deletePost = (req, res, next) => {
//   const postId = req.params.postId;
//   Post.findById(postId)
//     .then(post => {
//       if (!post) {
//         const error = new Error('Could not find post');
//         error.statusCode = 404;
//         throw error;
//       }
//       if (post.creator.toString() !== req.userId) {
//         const error = new Error('Not Authorized');
//         error.statusCode = 403;
//         throw error;
//       }
//       clearImage(post.imageUrl);
//       return Post.findByIdAndRemove(postId);
//     })
//     .then(result => {
//       return User.findById(req.userId)
//     })
//     .then(user => {
//       user.posts.pull(postId);
//       return user.save();
//     })
//     .then(result => {
//       res.status(200).json({ message: 'deleted post' })
//     })
//     .catch(err => {
//       if (!err.statusCode) {
//         err.statusCode = 500;
//       }
//       next(err);
//     })
// }

const clearImage = filePath => {
  filePath = path.join(__dirname, '..', filePath);
  fs.unlink(filePath, err => console.log(err));
}
