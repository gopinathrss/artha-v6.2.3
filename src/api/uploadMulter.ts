import multer from 'multer'
import os from 'os'
import path from 'path'

export const pieUpload = multer({ dest: path.join(os.tmpdir(), 'pie-uploads') })
/** @deprecated Use {@link pieUpload} */
export const arthaUpload = pieUpload
