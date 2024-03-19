import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/users.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"

const registerUser = asyncHandler( async (req, res) => {
    // Get user details from frontend
    // Validation - not empty value
    // Check if user already exists: username, email
    // Check for image, avatar
    // Upload them to cloudinary, avatar
    // Create user object - user entry in db
    // Remove password and refresh token from response
    // Check for user creation
    // Return the response

    const { username, email, fullName, password } = req.body
    
    if([username, email, fullName, password].some( 
        (field) => field?.trim() === "" 
    )){
        throw new ApiError(400, "All fields are required.")
    }

    const existedUser = await User.findOne(
        {
            $or: [{ username },{ email }]
        }
    )

    if(existedUser){
        throw new ApiError(409, "User with username or email already exists.")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar file is required.")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if(!avatar){
        throw new ApiError(400, "Avatar file is required.")
    }

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage > 0){
        coverImageLocalPath = req.files?.coverImage[0]?.path;
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    const user = await User.create({
        username: username.toLowerCase(),
        email,
        password,
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || ""
    })

    const createdUser = await User.findById(user._id).select("-password -refreshToken")

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user.")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )
})

export { registerUser }