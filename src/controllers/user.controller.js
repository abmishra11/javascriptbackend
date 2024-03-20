import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/users.model.js"
import { uploadOnCloudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"
import jwt from "jsonwebtoken"

const generateAccessTokenAndRefreshToken = async(userId) =>{
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken

        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating access token and refresh token.")
    }
}

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

const loginUser = asyncHandler( async(req, res) => {
    // Request body data
    // Username or email
    // Find the user
    // Password check
    // Access and refresh token 
    // Send cookies

    const { username, email, password } = req.body

    if(!username && !email){
        throw new ApiError(400, "username or email is required.")
    }

    const user = await User.findOne({
        $or: [{username}, {email}]
    })

    if(!user){
        throw new ApiError(404, "User does not exists.")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Invalid user credentials.")
    }

    const {accessToken, refreshToken} = await generateAccessTokenAndRefreshToken(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")

    const options = {
        httpOnly: true,
        secure: true
    }

    return  res
            .status(200)
            .cookie("accessToken", accessToken, options)
            .cookie("refreshToken", refreshToken, options)
            .json(
                new ApiResponse(
                    200,
                    {
                        user: loggedInUser,
                        accessToken,
                        refreshToken
                    },
                    "User logged in successfully."
                )
            )
})

const logoutUser = asyncHandler( async(req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
        {
            new: true
        }
    )

    const options = {
        httpOnly: true,
        secure: true
    }

    return  res
            .status(200)
            .clearCookie("accessToken", options)
            .clearCookie("refreshToken", options)
            .json(
                new ApiResponse(
                    200,
                    {},
                    "User logged out"
                )
            )
})

const refreshAccessToken = asyncHandler( async(req, res) => {

    const incommingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incommingRefreshToken){
        throw new ApiError(401, "Unauthorised request")
    }

    try {
        const decodedToken = jwt.verify(
            incommingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if(incommingRefreshToken !== user?.refreshToken){
            throw new ApiError(401, "Refresh token is expired or used.")
        }
    
        const {newAccessToken, newRefreshToken} = await generateAccessTokenAndRefreshToken(user._id)
    
        return  res
                .status(200)
                .cookie("accessToken", newAccessToken, process.env.OPTIONS )
                .cookie("refreshToken", newRefreshToken, process.env.OPTIONS )
                .json(
                    new ApiResponse(
                            200, 
                            {accessToken:newAccessToken, refreshToken:newRefreshToken},
                            "Access token refreshed"
                        )
                )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }
})

export { registerUser, loginUser, logoutUser, refreshAccessToken }